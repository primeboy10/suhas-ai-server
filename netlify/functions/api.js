const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const Groq = require("groq-sdk");
const serverless = require("serverless-http");
const { getStore } = require("@netlify/blobs");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ============================================================
// CONFIG
// ============================================================

const JWT_SECRET =
  process.env.JWT_SECRET || "SUHAS_AI_CHANGE_THIS_SECRET_2026";

const PORT = process.env.PORT || 3000;

// ============================================================
// NETLIFY BLOBS
// ============================================================

let store;

try {
  store = getStore("suhas-ai-data", {
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN,
  });
} catch (error) {
  console.error("Netlify Blobs initialization error:", error);
}

// ============================================================
// AI CLIENTS
// ============================================================

let groq = null;
let openai = null;

if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// ============================================================
// SUHAS AI SYSTEM PROMPT
// ============================================================

const SUHAS_AI_SYSTEM_PROMPT = `
You are Suhas AI, a friendly, intelligent and helpful AI assistant.

Your main goal is to understand what the user actually wants and explain it
clearly, naturally and correctly.

IMPORTANT RESPONSE STYLE:

1. Give natural human-like answers.
2. Explain concepts properly instead of only giving a short answer.
3. Do not make every answer look like a rigid template.
4. Do not unnecessarily create many headings.
5. Do not unnecessarily use tables or JSON.
6. Use bullet points only when they make the answer easier to understand.
7. When explaining a process, use clear step-by-step instructions.
8. When teaching something, explain the concept first and then give examples.
9. If the user asks a simple question, give a simple direct answer.
10. If the user needs a detailed explanation, provide a detailed explanation.
11. If the user writes in Hindi or Hinglish, reply naturally in Hindi/Hinglish.
12. If the user writes in English, reply in English.
13. For school questions, teach like a helpful teacher.
14. For mathematics, show the calculation step-by-step.
15. For coding questions, explain what the code does and then provide the code.
16. Never pretend that you performed an action that you did not perform.
17. Do not unnecessarily repeat the user's question.
18. Do not start every response with phrases like "Sure!" or "Absolutely!"
19. Keep the response conversational and easy to read.
20. Use Markdown when it genuinely improves readability.
21. Do not force a fixed response structure on every question.
22. Be accurate and honest if you are unsure.
23. The user may call you Suhas AI; respond naturally.

For educational questions:
- First explain the idea in simple words.
- Then solve or demonstrate it.
- Then give an example if useful.
- If the user appears confused, explain more simply rather than repeating the same wording.

For "how to" questions:
- Give practical steps.
- Mention exactly where the user should click/type when relevant.
- Avoid unnecessary technical jargon.

Your answers should feel like a real helpful assistant, not like a machine generating a rigid template.
`;

// ============================================================
// HELPERS
// ============================================================

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session",
    });
  }
}

async function getUsers() {
  if (!store) return {};

  try {
    const users = await store.get("users", {
      type: "json",
    });

    return users || {};
  } catch (error) {
    console.error("Get users error:", error);
    return {};
  }
}

async function saveUsers(users) {
  if (!store) {
    throw new Error("Netlify Blobs is not available");
  }

  await store.setJSON("users", users);
}

async function getUserChats(userId) {
  if (!store) return [];

  try {
    const chats = await store.get(`chats-${userId}`, {
      type: "json",
    });

    return chats || [];
  } catch (error) {
    console.error("Get chats error:", error);
    return [];
  }
}

async function saveUserChats(userId, chats) {
  if (!store) {
    throw new Error("Netlify Blobs is not available");
  }

  await store.setJSON(`chats-${userId}`, chats);
}

function generateId(prefix = "") {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Suhas AI",
    message: "Suhas AI server is running!",
  });
});

// ============================================================
// STATUS
// ============================================================

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    service: "Suhas AI",
    ai: {
      groq: !!process.env.GROQ_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
    features: {
      auth: true,
      chats: true,
      search: true,
    },
  });
});

// ============================================================
// SIGNUP
// ============================================================

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const users = await getUsers();

    if (users[normalizedEmail]) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      id: generateId("user_"),
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    users[normalizedEmail] = user;

    await saveUsers(users);

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create account",
    });
  }
});

// ============================================================
// LOGIN
// ============================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const users = await getUsers();

    const user = users[normalizedEmail];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to login",
    });
  }
});

// ============================================================
// CURRENT USER
// ============================================================

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const users = await getUsers();

    const user = users[req.user.email];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load user",
    });
  }
});

// ============================================================
// GET CHATS
// ============================================================

app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await getUserChats(req.user.id);

    res.json({
      success: true,
      chats,
    });
  } catch (error) {
    console.error("Get chats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load chats",
    });
  }
});

// ============================================================
// GET SINGLE CHAT
// ============================================================

app.get("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chats = await getUserChats(req.user.id);

    const chat = chats.find((item) => item.id === req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    res.json({
      success: true,
      chat,
    });
  } catch (error) {
    console.error("Get chat error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load chat",
    });
  }
});

// ============================================================
// DELETE CHAT
// ============================================================

app.delete("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chats = await getUserChats(req.user.id);

    const newChats = chats.filter(
      (chat) => chat.id !== req.params.id
    );

    await saveUserChats(req.user.id, newChats);

    res.json({
      success: true,
      message: "Chat deleted",
    });
  } catch (error) {
    console.error("Delete chat error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete chat",
    });
  }
});

// ============================================================
// SEARCH CHATS
// ============================================================

app.get("/api/chats/search", authMiddleware, async (req, res) => {
  try {
    const query = String(req.query.q || "")
      .trim()
      .toLowerCase();

    const chats = await getUserChats(req.user.id);

    if (!query) {
      return res.json({
        success: true,
        chats,
      });
    }

    const results = chats.filter((chat) => {
      const title = String(chat.title || "").toLowerCase();

      const messages = Array.isArray(chat.messages)
        ? chat.messages
            .map((message) => String(message.content || ""))
            .join(" ")
            .toLowerCase()
        : "";

      return (
        title.includes(query) ||
        messages.includes(query)
      );
    });

    res.json({
      success: true,
      chats: results,
    });
  } catch (error) {
    console.error("Search chats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to search chats",
    });
  }
});

// ============================================================
// ASK SUHAS AI
// ============================================================

app.post("/api/ask", authMiddleware, async (req, res) => {
  const startedAt = Date.now();

  try {
    const { message, chatId } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const userMessage = String(message).trim();

    let chats = await getUserChats(req.user.id);

    let chat;

    if (chatId) {
      chat = chats.find((item) => item.id === chatId);
    }

    if (!chat) {
      chat = {
        id: chatId || generateId("chat_"),
        title:
          userMessage.length > 60
            ? userMessage.substring(0, 60) + "..."
            : userMessage,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      chats.unshift(chat);
    }

    // --------------------------------------------------------
    // ADD USER MESSAGE
    // --------------------------------------------------------

    chat.messages.push({
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    });

    // Keep enough context without sending an unlimited history.
    const recentMessages = chat.messages
      .slice(-20)
      .map((item) => ({
        role:
          item.role === "assistant"
            ? "assistant"
            : "user",
        content: String(item.content || ""),
      }));

    let answer = null;
    let provider = null;
    let groqError = null;
    let openaiError = null;

    // ========================================================
    // TRY GROQ FIRST
    // ========================================================

    if (groq) {
      try {
        console.log("Suhas AI: Trying Groq...");

        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          temperature: 0.5,
          max_tokens: 4096,
          messages: [
            {
              role: "system",
              content: SUHAS_AI_SYSTEM_PROMPT,
            },
            ...recentMessages,
          ],
        });

        answer =
          completion?.choices?.[0]?.message?.content?.trim();

        if (answer) {
          provider = "Groq";
          console.log("Suhas AI: Groq response received");
        } else {
          groqError = "Groq returned an empty response";
          console.error(
            "Suhas AI Groq error:",
            groqError
          );
        }
      } catch (error) {
        groqError =
          error?.response?.data ||
          error?.message ||
          String(error);

        console.error(
          "Suhas AI Groq error:",
          groqError
        );
      }
    } else {
      groqError = "GROQ_API_KEY is not configured";
      console.error(
        "Suhas AI Groq error:",
        groqError
      );
    }

    // ========================================================
    // OPENAI FALLBACK
    // ========================================================

    if (!answer && openai) {
      try {
        console.log("Suhas AI: Trying OpenAI...");

        const completion =
          await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.5,
            max_tokens: 4096,
            messages: [
              {
                role: "system",
                content: SUHAS_AI_SYSTEM_PROMPT,
              },
              ...recentMessages,
            ],
          });

        answer =
          completion?.choices?.[0]?.message?.content?.trim();

        if (answer) {
          provider = "OpenAI";
          console.log(
            "Suhas AI: OpenAI response received"
          );
        } else {
          openaiError =
            "OpenAI returned an empty response";

          console.error(
            "Suhas AI OpenAI error:",
            openaiError
          );
        }
      } catch (error) {
        openaiError =
          error?.response?.data ||
          error?.message ||
          String(error);

        console.error(
          "Suhas AI OpenAI error:",
          openaiError
        );
      }
    } else if (!answer && !openai) {
      openaiError =
        "OPENAI_API_KEY is not configured";
    }

    // ========================================================
    // BOTH FAILED
    // ========================================================

    if (!answer) {
      console.error(
        "=========================================="
      );

      console.error(
        "SUHAS AI: BOTH AI PROVIDERS FAILED"
      );

      console.error(
        "Groq:",
        groqError
      );

      console.error(
        "OpenAI:",
        openaiError
      );

      console.error(
        "=========================================="
      );

      return res.status(503).json({
        success: false,
        message: "AI service is temporarily unavailable",
        details: {
          groq: groqError,
          openai: openaiError,
        },
      });
    }

    // ========================================================
    // SAVE ASSISTANT MESSAGE
    // ========================================================

    chat.messages.push({
      role: "assistant",
      content: answer,
      ai: provider,
      createdAt: new Date().toISOString(),
    });

    chat.updatedAt = new Date().toISOString();

    // Keep newest chats first.
    chats = chats.filter(
      (item) => item.id !== chat.id
    );

    chats.unshift(chat);

    // Optional limit so one user doesn't create huge storage.
    if (chats.length > 100) {
      chats = chats.slice(0, 100);
    }

    await saveUserChats(req.user.id, chats);

    console.log(
      `Suhas AI: Answer generated using ${provider} in ${
        Date.now() - startedAt
      }ms`
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.json({
      success: true,
      answer,
      ai: provider,
      chatId: chat.id,
      chat,
    });
  } catch (error) {
    console.error("Suhas AI unexpected error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while processing your message",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
  console.error("Express error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ============================================================
// LOCAL SERVER / NETLIFY FUNCTION
// ============================================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Suhas AI server running on http://localhost:${PORT}`
    );
  });
}

module.exports.handler = serverless(app);
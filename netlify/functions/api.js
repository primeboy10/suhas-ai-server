const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const Groq = require("groq-sdk");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const serverless = require("serverless-http");
const { getStore } = require("@netlify/blobs");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ==========================================
// SUHAS AI - NETLIFY BACKEND
// ==========================================

const JWT_SECRET =
  process.env.JWT_SECRET || "SUHAS_AI_CHANGE_THIS_SECRET_2026";

const store = getStore("suhas-ai-data");

// ==========================================
// NETLIFY BLOBS HELPERS
// ==========================================

async function readData(key, fallback) {
  const data = await store.get(key, { type: "json" });
  return data ?? fallback;
}

async function writeData(key, data) {
  await store.setJSON(key, data);
}

// ==========================================
// AI SETUP
// ==========================================

let openai = null;
let groq = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

// ==========================================
// HOME / STATUS
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Suhas AI API is running!",
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    service: "Suhas AI",
    status: "online",
    openai: !!openai,
    groq: !!groq,
    ai: !!(openai || groq),
    login: true,
    chatHistory: true,
    search: true,
  });
});

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = header.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

// ==========================================
// SIGN UP
// ==========================================

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
        message: "Password must be at least 6 characters",
      });
    }

    const users = await readData("users", []);

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = users.find(
      (user) => user.email === normalizedEmail
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    users.push(user);

    await writeData("users", users);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    res.json({
      success: true,
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
      message: "Signup failed",
    });
  }
});

// ==========================================
// LOGIN
// ==========================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const users = await readData("users", []);

    const normalizedEmail = email.trim().toLowerCase();

    const user = users.find(
      (u) => u.email === normalizedEmail
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    res.json({
      success: true,
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
      message: "Login failed",
    });
  }
});

// ==========================================
// CURRENT USER
// ==========================================

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const users = await readData("users", []);

    const user = users.find(
      (u) => u.id === req.user.id
    );

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
    console.error("Me error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load user",
    });
  }
});

// ==========================================
// CREATE CHAT
// ==========================================

app.post("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await readData("chats", []);

    const chat = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      title: req.body.title || "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    chats.push(chat);

    await writeData("chats", chats);

    res.json({
      success: true,
      chat,
    });
  } catch (error) {
    console.error("Create chat error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create chat",
    });
  }
});

// ==========================================
// GET CHATS
// ==========================================

app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await readData("chats", []);

    const userChats = chats
      .filter((chat) => chat.userId === req.user.id)
      .sort(
        (a, b) =>
          new Date(b.updatedAt) -
          new Date(a.updatedAt)
      );

    res.json({
      success: true,
      chats: userChats,
    });
  } catch (error) {
    console.error("Get chats error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load chats",
    });
  }
});

// ==========================================
// GET ONE CHAT
// ==========================================

app.get(
  "/api/chats/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const chats = await readData("chats", []);

      const chat = chats.find(
        (c) =>
          c.id === req.params.id &&
          c.userId === req.user.id
      );

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
        message: "Could not load chat",
      });
    }
  }
);

// ==========================================
// UPDATE CHAT
// ==========================================

app.put(
  "/api/chats/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const chats = await readData("chats", []);

      const index = chats.findIndex(
        (c) =>
          c.id === req.params.id &&
          c.userId === req.user.id
      );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      chats[index] = {
        ...chats[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };

      await writeData("chats", chats);

      res.json({
        success: true,
        chat: chats[index],
      });
    } catch (error) {
      console.error("Update chat error:", error);

      res.status(500).json({
        success: false,
        message: "Could not update chat",
      });
    }
  }
);

// ==========================================
// DELETE ONE CHAT
// ==========================================

app.delete(
  "/api/chats/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const chats = await readData("chats", []);

      const oldLength = chats.length;

      const filtered = chats.filter(
        (c) =>
          !(
            c.id === req.params.id &&
            c.userId === req.user.id
          )
      );

      if (filtered.length === oldLength) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      await writeData("chats", filtered);

      res.json({
        success: true,
        message: "Chat deleted",
      });
    } catch (error) {
      console.error("Delete chat error:", error);

      res.status(500).json({
        success: false,
        message: "Could not delete chat",
      });
    }
  }
);

// ==========================================
// SEARCH CHATS
// ==========================================

app.get(
  "/api/chats/search",
  authMiddleware,
  async (req, res) => {
    try {
      const q = String(req.query.q || "")
        .trim()
        .toLowerCase();

      const chats = await readData("chats", []);

      const userChats = chats.filter(
        (chat) => chat.userId === req.user.id
      );

      if (!q) {
        return res.json({
          success: true,
          chats: userChats,
        });
      }

      const results = userChats.filter((chat) => {
        const title = String(chat.title || "").toLowerCase();

        const messages = JSON.stringify(
          chat.messages || []
        ).toLowerCase();

        return (
          title.includes(q) ||
          messages.includes(q)
        );
      });

      res.json({
        success: true,
        chats: results,
      });
    } catch (error) {
      console.error("Search error:", error);

      res.status(500).json({
        success: false,
        message: "Search failed",
      });
    }
  }
);

// ==========================================
// ASK AI
// ==========================================

app.post("/api/ask", authMiddleware, async (req, res) => {
  try {
    const { question, chatId } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({
        success: false,
        message: "Question is required",
      });
    }

    const chats = await readData("chats", []);

    let chat = null;

    if (chatId) {
      chat = chats.find(
        (c) =>
          c.id === chatId &&
          c.userId === req.user.id
      );
    }

    if (!chat) {
      chat = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        title: String(question)
          .trim()
          .slice(0, 60),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      chats.push(chat);
    }

    chat.messages.push({
      role: "user",
      content: String(question).trim(),
      createdAt: new Date().toISOString(),
    });

    const recentMessages = chat.messages
      .slice(-24)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const systemPrompt = `
You are Suhas AI, a helpful AI assistant.

Rules:
- Give accurate and useful answers.
- Explain difficult things step by step.
- Use simple language when appropriate.
- For maths, show the complete solution.
- For coding, provide working code and explain where to put it.
- Use Markdown when it improves readability.
- If you are uncertain about something, clearly say so.
- Never pretend to have information you do not have.
`;

    let answer = "";
    let ai = "";

    // ======================================
    // OPENAI PRIMARY
    // ======================================

    if (openai) {
      try {
        const completion =
          await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 4096,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              ...recentMessages,
            ],
          });

        answer =
          completion.choices?.[0]?.message?.content ||
          "";

        ai = "OpenAI";
      } catch (error) {
        console.error(
          "OpenAI failed:",
          error.message
        );
      }
    }

    // ======================================
    // GROQ BACKUP
    // ======================================

    if (!answer && groq) {
      try {
        const completion =
          await groq.chat.completions.create({
            model: "openai/gpt-oss-120b",
            temperature: 0.3,
            max_tokens: 4096,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              ...recentMessages,
            ],
          });

        answer =
          completion.choices?.[0]?.message?.content ||
          "";

        ai = "Groq";
      } catch (error) {
        console.error(
          "Groq failed:",
          error.message
        );
      }
    }

    if (!answer) {
      return res.status(503).json({
        success: false,
        message:
          "AI service is not available. Check your API keys.",
      });
    }

    chat.messages.push({
      role: "assistant",
      content: answer,
      ai,
      createdAt: new Date().toISOString(),
    });

    chat.updatedAt = new Date().toISOString();

    const index = chats.findIndex(
      (c) => c.id === chat.id
    );

    if (index === -1) {
      chats.push(chat);
    } else {
      chats[index] = chat;
    }

    await writeData("chats", chats);

    res.json({
      success: true,
      answer,
      ai,
      chatId: chat.id,
      chat,
    });
  } catch (error) {
    console.error("Ask error:", error);

    res.status(500).json({
      success: false,
      message: "AI request failed",
    });
  }
});

// ==========================================
// DELETE ALL USER CHATS
// ==========================================

app.delete(
  "/api/chats",
  authMiddleware,
  async (req, res) => {
    try {
      const chats = await readData("chats", []);

      const filtered = chats.filter(
        (chat) => chat.userId !== req.user.id
      );

      await writeData("chats", filtered);

      res.json({
        success: true,
        message: "All chats deleted",
      });
    } catch (error) {
      console.error(
        "Delete all chats error:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Could not delete chats",
      });
    }
  }
);

// ==========================================
// NETLIFY FUNCTION EXPORT
// ==========================================

module.exports.handler = serverless(app);
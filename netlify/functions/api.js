const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const Groq = require("groq-sdk");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const serverless = require("serverless-http");
const { getStore } = require("@netlify/blobs");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ==========================================
// NETLIFY BLOBS
// ==========================================

const store = getStore("suhas-ai-data");

async function readData(key, fallback) {
  const data = await store.get(key, {
    type: "json",
  });

  return data ?? fallback;
}

async function writeData(key, data) {
  await store.setJSON(key, data);
}

// ==========================================
// JWT
// ==========================================

const JWT_SECRET =
  process.env.JWT_SECRET || "SUHAS_AI_CHANGE_THIS_SECRET_2026";

// ==========================================
// AI CLIENTS
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
// BASIC ROUTE
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Suhas AI",
    message: "Suhas AI server is running!",
  });
});

// ==========================================
// STATUS
// ==========================================

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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

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
// SIGNUP
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

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id:
        Date.now().toString() +
        "-" +
        Math.random().toString(36).substring(2, 10),

      name: name.trim(),

      email: normalizedEmail,

      password: hashedPassword,

      createdAt: new Date().toISOString(),
    };

    users.push(newUser);

    await writeData("users", users);

    const token = jwt.sign(
      {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully",

      token,

      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      success: false,
      message: "Signup failed",
      error: error.message,
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
      (item) => item.email === normalizedEmail
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    return res.json({
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

    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
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
      (item) => item.id === req.user.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message,
    });
  }
});

// ==========================================
// CREATE CHAT
// ==========================================

app.post("/api/chats", authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;

    const chats = await readData("chats", []);

    const newChat = {
      id:
        Date.now().toString() +
        "-" +
        Math.random().toString(36).substring(2, 10),

      userId: req.user.id,

      title: title || "New Chat",

      messages: [],

      createdAt: new Date().toISOString(),

      updatedAt: new Date().toISOString(),
    };

    chats.push(newChat);

    await writeData("chats", chats);

    return res.status(201).json({
      success: true,
      chat: newChat,
    });
  } catch (error) {
    console.error("Create chat error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create chat",
      error: error.message,
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

    return res.json({
      success: true,
      chats: userChats,
    });
  } catch (error) {
    console.error("Get chats error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get chats",
      error: error.message,
    });
  }
});

// ==========================================
// GET SINGLE CHAT
// ==========================================

app.get("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chats = await readData("chats", []);

    const chat = chats.find(
      (item) =>
        item.id === req.params.id &&
        item.userId === req.user.id
    );

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    return res.json({
      success: true,
      chat,
    });
  } catch (error) {
    console.error("Get chat error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get chat",
      error: error.message,
    });
  }
});

// ==========================================
// UPDATE CHAT
// ==========================================

app.put("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const { title, messages } = req.body;

    const chats = await readData("chats", []);

    const index = chats.findIndex(
      (item) =>
        item.id === req.params.id &&
        item.userId === req.user.id
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    if (title !== undefined) {
      chats[index].title = title;
    }

    if (messages !== undefined) {
      chats[index].messages = messages;
    }

    chats[index].updatedAt = new Date().toISOString();

    await writeData("chats", chats);

    return res.json({
      success: true,
      chat: chats[index],
    });
  } catch (error) {
    console.error("Update chat error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update chat",
      error: error.message,
    });
  }
});

// ==========================================
// DELETE SINGLE CHAT
// ==========================================

app.delete("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chats = await readData("chats", []);

    const newChats = chats.filter(
      (chat) =>
        !(
          chat.id === req.params.id &&
          chat.userId === req.user.id
        )
    );

    if (newChats.length === chats.length) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    await writeData("chats", newChats);

    return res.json({
      success: true,
      message: "Chat deleted successfully",
    });
  } catch (error) {
    console.error("Delete chat error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete chat",
      error: error.message,
    });
  }
});

// ==========================================
// SEARCH CHATS
// ==========================================

app.get("/api/chats/search", authMiddleware, async (req, res) => {
  try {
    const query = String(req.query.q || "")
      .trim()
      .toLowerCase();

    if (!query) {
      return res.json({
        success: true,
        chats: [],
      });
    }

    const chats = await readData("chats", []);

    const userChats = chats.filter(
      (chat) => chat.userId === req.user.id
    );

    const results = userChats.filter((chat) => {
      const titleMatch = String(chat.title || "")
        .toLowerCase()
        .includes(query);

      const messageMatch = Array.isArray(chat.messages)
        ? chat.messages.some((message) =>
            String(message.content || "")
              .toLowerCase()
              .includes(query)
          )
        : false;

      return titleMatch || messageMatch;
    });

    return res.json({
      success: true,
      chats: results,
    });
  } catch (error) {
    console.error("Search chats error:", error);

    return res.status(500).json({
      success: false,
      message: "Search failed",
      error: error.message,
    });
  }
});

// ==========================================
// ASK AI
// ==========================================

app.post("/api/ask", authMiddleware, async (req, res) => {
  try {
    const { message, chatId } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const userMessage = String(message).trim();

    const chats = await readData("chats", []);

    let chat = null;
    let chatIndex = -1;

    if (chatId) {
      chatIndex = chats.findIndex(
        (item) =>
          item.id === chatId &&
          item.userId === req.user.id
      );

      if (chatIndex !== -1) {
        chat = chats[chatIndex];
      }
    }

    if (!chat) {
      chat = {
        id:
          Date.now().toString() +
          "-" +
          Math.random().toString(36).substring(2, 10),

        userId: req.user.id,

        title:
          userMessage.length > 50
            ? userMessage.substring(0, 50) + "..."
            : userMessage,

        messages: [],

        createdAt: new Date().toISOString(),

        updatedAt: new Date().toISOString(),
      };

      chats.push(chat);

      chatIndex = chats.length - 1;
    }

    chat.messages.push({
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    });

    let answer = "";
    let aiUsed = "";

    const aiMessages = [
      {
        role: "system",
        content:
          "You are Suhas AI, a helpful, friendly and accurate AI assistant. Answer clearly and naturally. Use simple language when appropriate.",
      },

      ...chat.messages.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    ];

    // ======================================
    // OPENAI PRIMARY
    // ======================================

    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",

          messages: aiMessages,

          temperature: 0.3,

          max_tokens: 4096,
        });

        answer =
          completion.choices?.[0]?.message?.content ||
          "";

        if (answer) {
          aiUsed = "OpenAI";
        }
      } catch (error) {
        console.error(
          "OpenAI error:",
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

            messages: aiMessages,

            temperature: 0.3,

            max_tokens: 4096,
          });

        answer =
          completion.choices?.[0]?.message?.content ||
          "";

        if (answer) {
          aiUsed = "Groq";
        }
      } catch (error) {
        console.error(
          "Groq error:",
          error.message
        );
      }
    }

    if (!answer) {
      return res.status(503).json({
        success: false,
        message:
          "AI service is temporarily unavailable",
      });
    }

    chat.messages.push({
      role: "assistant",
      content: answer,
      ai: aiUsed,
      createdAt: new Date().toISOString(),
    });

    chat.updatedAt = new Date().toISOString();

    chats[chatIndex] = chat;

    await writeData("chats", chats);

    return res.json({
      success: true,

      answer,

      ai: aiUsed,

      chatId: chat.id,

      chat,
    });
  } catch (error) {
    console.error("AI request error:", error);

    return res.status(500).json({
      success: false,
      message: "AI request failed",
      error: error.message,
    });
  }
});

// ==========================================
// DELETE ALL USER CHATS
// ==========================================

app.delete("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await readData("chats", []);

    const remainingChats = chats.filter(
      (chat) => chat.userId !== req.user.id
    );

    await writeData("chats", remainingChats);

    return res.json({
      success: true,
      message: "All chats deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete all chats error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete chats",
      error: error.message,
    });
  }
});

// ==========================================
// NETLIFY FUNCTION EXPORT
// ==========================================

module.exports.handler = serverless(app);
// ============================================================
// SUHAS AI SERVER
// OpenAI + Groq + Login + Signup + Profile + Chat History
// ============================================================

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const Groq = require("groq-sdk");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------

const JWT_SECRET =
  process.env.JWT_SECRET || "SUHAS_AI_CHANGE_THIS_SECRET_2026";

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");

// ------------------------------------------------------------
// DATABASE FILES
// ------------------------------------------------------------

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(CHATS_FILE, "[]", "utf8");
}

// ------------------------------------------------------------
// JSON DATABASE FUNCTIONS
// ------------------------------------------------------------

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function getUsers() {
  return readJSON(USERS_FILE);
}

function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function getChats() {
  return readJSON(CHATS_FILE);
}

function saveChats(chats) {
  writeJSON(CHATS_FILE, chats);
}

// ------------------------------------------------------------
// AI CONNECTIONS
// ------------------------------------------------------------

let openai = null;
let groq = null;

// OpenAI
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Groq
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });
}

// ------------------------------------------------------------
// ROOT
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Suhas AI</title>

<style>

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f5f7fb;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.box {
  background: white;
  padding: 40px;
  border-radius: 20px;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
}

h1 {
  color: #2563eb;
}

p {
  color: #555;
}

</style>

</head>

<body>

<div class="box">

<h1>🤖 Suhas AI</h1>

<p>AI Server is running successfully!</p>

<p>
API:
<a href="/api/status">
/api/status
</a>
</p>

</div>

</body>
</html>
  `);
});

// ------------------------------------------------------------
// STATUS
// ------------------------------------------------------------

app.get("/api/status", (req, res) => {

  const users = getUsers();
  const chats = getChats();

  res.json({

    success: true,

    name: "Suhas AI",

    server: "running",

    port: PORT,

    openai: !!openai,

    groq: !!groq,

    ai: !!openai || !!groq,

    users: users.length,

    chats: chats.length

  });

});

// ------------------------------------------------------------
// AUTH MIDDLEWARE
// ------------------------------------------------------------

function authMiddleware(req, res, next) {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res.status(401).json({

        success: false,

        message: "Login required"

      });

    }

    const parts =
      authHeader.split(" ");

    if (
      parts.length !== 2 ||
      parts[0] !== "Bearer"
    ) {

      return res.status(401).json({

        success: false,

        message: "Invalid authorization"

      });

    }

    const token = parts[1];

    const decoded =
      jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({

      success: false,

      message: "Invalid or expired token"

    });

  }

}

// ============================================================
// SIGNUP
// ============================================================

app.post("/api/auth/signup", async (req, res) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;

    if (
      !name ||
      !email ||
      !password
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Name, email and password are required"

      });

    }

    if (password.length < 6) {

      return res.status(400).json({

        success: false,

        message:
          "Password must be at least 6 characters"

      });

    }

    const cleanEmail =
      email.trim().toLowerCase();

    const users = getUsers();

    const existingUser =
      users.find(
        user =>
          user.email === cleanEmail
      );

    if (existingUser) {

      return res.status(409).json({

        success: false,

        message:
          "Email already registered"

      });

    }

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );

    const user = {

      id: crypto.randomUUID(),

      name: name.trim(),

      email: cleanEmail,

      passwordHash,

      createdAt:
        new Date().toISOString()

    };

    users.push(user);

    saveUsers(users);

    const token =
      jwt.sign(

        {
          id: user.id,
          email: user.email,
          name: user.name
        },

        JWT_SECRET,

        {
          expiresIn: "30d"
        }

      );

    res.json({

      success: true,

      message:
        "Account created successfully",

      token,

      user: {

        id: user.id,

        name: user.name,

        email: user.email

      }

    });

  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Signup failed"

    });

  }

});

// ============================================================
// LOGIN
// ============================================================

app.post("/api/auth/login", async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;

    if (!email || !password) {

      return res.status(400).json({

        success: false,

        message:
          "Email and password are required"

      });

    }

    const cleanEmail =
      email.trim().toLowerCase();

    const users = getUsers();

    const user =
      users.find(
        user =>
          user.email === cleanEmail
      );

    if (!user) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid email or password"

      });

    }

    const validPassword =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!validPassword) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid email or password"

      });

    }

    const token =
      jwt.sign(

        {
          id: user.id,
          email: user.email,
          name: user.name
        },

        JWT_SECRET,

        {
          expiresIn: "30d"
        }

      );

    res.json({

      success: true,

      message:
        "Login successful",

      token,

      user: {

        id: user.id,

        name: user.name,

        email: user.email

      }

    });

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Login failed"

    });

  }

});

// ============================================================
// PROFILE
// ============================================================

app.get(
  "/api/auth/me",
  authMiddleware,
  (req, res) => {

    const users = getUsers();

    const user =
      users.find(
        user =>
          user.id === req.user.id
      );

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found"

      });

    }

    res.json({

      success: true,

      user: {

        id: user.id,

        name: user.name,

        email: user.email,

        createdAt:
          user.createdAt

      }

    });

  }
);

// ============================================================
// CREATE CHAT
// ============================================================

app.post(
  "/api/chats",
  authMiddleware,
  (req, res) => {

    try {

      const {
        title,
        messages
      } = req.body;

      const chats = getChats();

      const chat = {

        id: crypto.randomUUID(),

        userId: req.user.id,

        title:
          title || "New Chat",

        messages:
          Array.isArray(messages)
            ? messages
            : [],

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()

      };

      chats.unshift(chat);

      saveChats(chats);

      res.json({

        success: true,

        chat

      });

    } catch (error) {

      console.error(
        "CREATE CHAT ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Could not create chat"

      });

    }

  }
);

// ============================================================
// GET ALL CHATS
// ============================================================

app.get(
  "/api/chats",
  authMiddleware,
  (req, res) => {

    const chats = getChats();

    const userChats =
      chats

        .filter(
          chat =>
            chat.userId === req.user.id
        )

        .sort(
          (a, b) =>
            new Date(b.updatedAt) -
            new Date(a.updatedAt)
        );

    res.json({

      success: true,

      chats: userChats

    });

  }
);

// ============================================================
// GET ONE CHAT
// ============================================================

app.get(
  "/api/chats/:id",
  authMiddleware,
  (req, res) => {

    const chats = getChats();

    const chat =
      chats.find(

        chat =>

          chat.id === req.params.id &&

          chat.userId === req.user.id

      );

    if (!chat) {

      return res.status(404).json({

        success: false,

        message:
          "Chat not found"

      });

    }

    res.json({

      success: true,

      chat

    });

  }
);

// ============================================================
// UPDATE CHAT
// ============================================================

app.put(
  "/api/chats/:id",
  authMiddleware,
  (req, res) => {

    const chats = getChats();

    const index =
      chats.findIndex(

        chat =>

          chat.id === req.params.id &&

          chat.userId === req.user.id

      );

    if (index === -1) {

      return res.status(404).json({

        success: false,

        message:
          "Chat not found"

      });

    }

    if (
      req.body.title !== undefined
    ) {

      chats[index].title =
        req.body.title;

    }

    if (
      req.body.messages !== undefined
    ) {

      chats[index].messages =
        req.body.messages;

    }

    chats[index].updatedAt =
      new Date().toISOString();

    saveChats(chats);

    res.json({

      success: true,

      chat: chats[index]

    });

  }
);

// ============================================================
// DELETE CHAT
// ============================================================

app.delete(
  "/api/chats/:id",
  authMiddleware,
  (req, res) => {

    const chats = getChats();

    const oldLength =
      chats.length;

    const newChats =
      chats.filter(

        chat =>

          !(
            chat.id === req.params.id &&
            chat.userId === req.user.id
          )

      );

    if (
      newChats.length === oldLength
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Chat not found"

      });

    }

    saveChats(newChats);

    res.json({

      success: true,

      message:
        "Chat deleted"

    });

  }
);

// ============================================================
// SEARCH CHATS
// ============================================================

app.get(
  "/api/chats/search",
  authMiddleware,
  (req, res) => {

    const query =
      String(req.query.q || "")
        .trim()
        .toLowerCase();

    const chats = getChats();

    const userChats =
      chats.filter(
        chat =>
          chat.userId === req.user.id
      );

    if (!query) {

      return res.json({

        success: true,

        chats: userChats

      });

    }

    const results =
      userChats.filter(chat => {

        const titleMatch =

          String(chat.title || "")
            .toLowerCase()
            .includes(query);

        const messageMatch =

          JSON.stringify(
            chat.messages || []
          )
            .toLowerCase()
            .includes(query);

        return (
          titleMatch ||
          messageMatch
        );

      });

    res.json({

      success: true,

      chats: results

    });

  }
);

// ============================================================
// AI ASK
// ============================================================

app.post(
  "/api/ask",
  authMiddleware,
  async (req, res) => {

    try {

      const {
        question,
        chatId
      } = req.body;

      if (
        !question ||
        !question.trim()
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Question is required"

        });

      }

      if (!openai && !groq) {

        return res.status(500).json({

          success: false,

          message:
            "No AI API key is connected. Add OPENAI_API_KEY or GROQ_API_KEY to .env"

        });

      }

      const chats = getChats();

      let chat = null;

      let chatIndex = -1;

      if (chatId) {

        chatIndex =
          chats.findIndex(

            item =>

              item.id === chatId &&

              item.userId === req.user.id

          );

        if (chatIndex !== -1) {

          chat =
            chats[chatIndex];

        }

      }

      if (!chat) {

        chat = {

          id:
            crypto.randomUUID(),

          userId:
            req.user.id,

          title:
            question
              .trim()
              .substring(0, 60),

          messages: [],

          createdAt:
            new Date().toISOString(),

          updatedAt:
            new Date().toISOString()

        };

        chats.unshift(chat);

        chatIndex = 0;

      }

      chat.messages.push({

        role: "user",

        content:
          question.trim(),

        timestamp:
          new Date().toISOString()

      });

      const recentMessages =
        chat.messages
          .slice(-24)
          .map(message => ({

            role:
              message.role,

            content:
              message.content

          }));

      const systemMessage = {

        role: "system",

        content: `
You are Suhas AI, a helpful AI assistant.

Rules:

- Give accurate and clear answers.
- Explain difficult topics step by step.
- Use Markdown formatting.
- Use headings when useful.
- Use bullet points for lists.
- Use numbered steps for procedures.
- Use code blocks for programming code.
- Use tables when useful.
- For maths, show calculations.
- If you are unsure, say so.
- Never pretend to know something you do not know.
`

      };

      let answer = "";

      let usedAI = "";

      // ------------------------------------------------------
      // OPENAI PRIMARY
      // ------------------------------------------------------

      if (openai) {

        try {

          const completion =
            await openai.chat.completions.create({

              model:
                "gpt-4o-mini",

              messages: [
                systemMessage,
                ...recentMessages
              ],

              temperature: 0.3,

              max_tokens: 4096

            });

          answer =
            completion
              .choices?.[0]
              ?.message
              ?.content || "";

          if (answer) {

            usedAI = "OpenAI";

          }

        } catch (openAIError) {

          console.error(
            "OPENAI ERROR:",
            openAIError.message
          );

        }

      }

      // ------------------------------------------------------
      // GROQ BACKUP
      // ------------------------------------------------------

      if (!answer && groq) {

        try {

          const completion =
            await groq.chat.completions.create({

              model:
                "openai/gpt-oss-120b",

              messages: [
                systemMessage,
                ...recentMessages
              ],

              temperature: 0.3,

              max_tokens: 4096

            });

          answer =
            completion
              .choices?.[0]
              ?.message
              ?.content || "";

          if (answer) {

            usedAI = "Groq";

          }

        } catch (groqError) {

          console.error(
            "GROQ ERROR:",
            groqError.message
          );

        }

      }

      if (!answer) {

        return res.status(500).json({

          success: false,

          message:
            "Both AI services failed. Check your API keys."

        });

      }

      chat.messages.push({

        role: "assistant",

        content: answer,

        timestamp:
          new Date().toISOString()

      });

      chat.updatedAt =
        new Date().toISOString();

      if (chatIndex === -1) {

        chats.unshift(chat);

      } else {

        chats[chatIndex] =
          chat;

      }

      saveChats(chats);

      res.json({

        success: true,

        answer,

        ai: usedAI,

        chatId:
          chat.id,

        chat

      });

    } catch (error) {

      console.error(
        "AI ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "AI request failed",

        error:
          error.message

      });

    }

  }
);

// ============================================================
// DELETE ALL CHATS
// ============================================================

app.delete(
  "/api/chats",
  authMiddleware,
  (req, res) => {

    const chats = getChats();

    const remaining =
      chats.filter(
        chat =>
          chat.userId !== req.user.id
      );

    saveChats(remaining);

    res.json({

      success: true,

      message:
        "All chats deleted"

    });

  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {

    console.log("");

    console.log(
      "=========================================="
    );

    console.log(
      "            SUHAS AI SERVER"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `Website/API: http://localhost:${PORT}`
    );

    console.log(
      `Status:      http://localhost:${PORT}/api/status`
    );

    console.log(
      `OpenAI:      ${openai ? "Connected" : "NOT CONNECTED"}`
    );

    console.log(
      `Groq:        ${groq ? "Connected" : "NOT CONNECTED"}`
    );

    console.log(
      `AI:          ${
        openai || groq
          ? "Connected"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      "Login:       Enabled"
    );

    console.log(
      "Chat History: Enabled"
    );

    console.log(
      "Search:      Enabled"
    );

    console.log(
      "=========================================="
    );

    console.log("");

  }
);
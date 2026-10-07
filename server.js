// ============================================================
// SUHAS AI SERVER
// OpenAI + Groq + YouTube Search
// Login + Signup + Profile + Chat History
// ADMIN DASHBOARD + ADMIN PASSWORD RESET
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

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(
  express.json({
    limit: "10mb"
  })
);

// ============================================================
// CONFIG
// ============================================================

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "SUHAS_AI_CHANGE_THIS_SECRET_2026";

// Admin email
const ADMIN_EMAIL =
  (process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

// Admin password reset code
const ADMIN_RESET_CODE =
  (process.env.ADMIN_RESET_CODE || "").trim();

// ============================================================
// DATA FILES
// ============================================================

const DATA_DIR =
  path.join(__dirname, "data");

const USERS_FILE =
  path.join(DATA_DIR, "users.json");

const CHATS_FILE =
  path.join(DATA_DIR, "chats.json");

const INDEX_FILE =
  path.join(__dirname, "index.html");

// ============================================================
// API KEYS
// ============================================================

const YOUTUBE_API_KEY =
  process.env.YOUTUBE_API_KEY || "";

// ============================================================
// DATABASE SETUP
// ============================================================

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(
    USERS_FILE,
    "[]",
    "utf8"
  );
}

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(
    CHATS_FILE,
    "[]",
    "utf8"
  );
}

// ============================================================
// JSON DATABASE FUNCTIONS
// ============================================================

function readJSON(file) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      "READ JSON ERROR:",
      error.message
    );

    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );
}

function getUsers() {
  return readJSON(USERS_FILE);
}

function saveUsers(users) {
  writeJSON(
    USERS_FILE,
    users
  );
}

function getChats() {
  return readJSON(CHATS_FILE);
}

function saveChats(chats) {
  writeJSON(
    CHATS_FILE,
    chats
  );
}

// ============================================================
// AI CONNECTIONS
// ============================================================

let openai = null;
let groq = null;

// ============================================================
// OPENAI
// ============================================================

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY
  });
}

// ============================================================
// GROQ
// ============================================================

if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey:
      process.env.GROQ_API_KEY
  });
}

// ============================================================
// FRONTEND
// ============================================================

app.get("/", (req, res) => {

  if (!fs.existsSync(INDEX_FILE)) {

    return res.status(404).send(`
<!DOCTYPE html>
<html>
<head>
<title>Suhas AI - Error</title>

<style>

body {
  background:#000;
  color:white;
  font-family:Arial,sans-serif;
  padding:40px;
}

.box {
  max-width:700px;
  margin:50px auto;
  padding:30px;
  border:1px solid #333;
  border-radius:15px;
  background:#111;
}

code {
  color:#00ff88;
}

</style>

</head>

<body>

<div class="box">

<h1>⚠️ index.html not found</h1>

<p>
Please put your
<b>index.html</b>
inside:
</p>

<code>${__dirname}</code>

</div>

</body>
</html>
    `);
  }

  res.sendFile(
    INDEX_FILE
  );
});

// ============================================================
// STATUS
// ============================================================

app.get(
  "/api/status",
  (req, res) => {

    const users =
      getUsers();

    const chats =
      getChats();

    res.json({

      success: true,

      name:
        "Suhas AI",

      server:
        "running",

      port:
        PORT,

      openai:
        !!openai,

      groq:
        !!groq,

      youtube:
        !!YOUTUBE_API_KEY,

      ai:
        !!openai ||
        !!groq,

      adminConfigured:
        !!ADMIN_EMAIL,

      passwordResetConfigured:
        !!ADMIN_RESET_CODE,

      users:
        users.length,

      chats:
        chats.length
    });
  }
);

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function authMiddleware(
  req,
  res,
  next
) {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res.status(401).json({

        success:
          false,

        message:
          "Login required"
      });
    }

    const parts =
      authHeader.split(" ");

    if (
      parts.length !== 2 ||
      parts[0] !== "Bearer"
    ) {

      return res.status(401).json({

        success:
          false,

        message:
          "Invalid authorization"
      });
    }

    const token =
      parts[1];

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.user =
      decoded;

    next();

  } catch (error) {

    return res.status(401).json({

      success:
        false,

      message:
        "Invalid or expired token"
    });
  }
}

// ============================================================
// ADMIN MIDDLEWARE
// ============================================================

function adminMiddleware(
  req,
  res,
  next
) {

  try {

    if (!ADMIN_EMAIL) {

      return res.status(503).json({

        success:
          false,

        message:
          "Admin is not configured on the server"
      });
    }

    if (!req.user) {

      return res.status(401).json({

        success:
          false,

        message:
          "Login required"
      });
    }

    const userEmail =
      String(
        req.user.email || ""
      )
        .trim()
        .toLowerCase();

    if (
      userEmail !==
      ADMIN_EMAIL
    ) {

      return res.status(403).json({

        success:
          false,

        message:
          "Admin access denied"
      });
    }

    next();

  } catch (error) {

    console.error(
      "ADMIN MIDDLEWARE ERROR:",
      error.message
    );

    return res.status(403).json({

      success:
        false,

      message:
        "Admin access denied"
    });
  }
}

// ============================================================
// SIGNUP
// ============================================================

app.post(
  "/api/auth/signup",
  async (req, res) => {

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

          success:
            false,

          message:
            "Name, email and password are required"
        });
      }

      if (
        password.length < 6
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Password must be at least 6 characters"
        });
      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      const users =
        getUsers();

      const existingUser =
        users.find(
          user =>
            user.email ===
            cleanEmail
        );

      if (existingUser) {

        return res.status(409).json({

          success:
            false,

          message:
            "Email already registered"
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const now =
        new Date().toISOString();

      const user = {

        id:
          crypto.randomUUID(),

        name:
          name.trim(),

        email:
          cleanEmail,

        passwordHash,

        createdAt:
          now,

        lastLoginAt:
          null
      };

      users.push(user);

      saveUsers(users);

      const token =
        jwt.sign(

          {
            id:
              user.id,

            email:
              user.email,

            name:
              user.name
          },

          JWT_SECRET,

          {
            expiresIn:
              "30d"
          }
        );

      res.json({

        success:
          true,

        message:
          "Account created successfully",

        token,

        user: {

          id:
            user.id,

          name:
            user.name,

          email:
            user.email
        }
      });

    } catch (error) {

      console.error(
        "SIGNUP ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Signup failed"
      });
    }
  }
);

// ============================================================
// LOGIN
// ============================================================

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;

      if (
        !email ||
        !password
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Email and password are required"
        });
      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      const users =
        getUsers();

      const user =
        users.find(
          user =>
            user.email ===
            cleanEmail
        );

      if (!user) {

        return res.status(401).json({

          success:
            false,

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

          success:
            false,

          message:
            "Invalid email or password"
        });
      }

      user.lastLoginAt =
        new Date().toISOString();

      saveUsers(users);

      const token =
        jwt.sign(

          {
            id:
              user.id,

            email:
              user.email,

            name:
              user.name
          },

          JWT_SECRET,

          {
            expiresIn:
              "30d"
          }
        );

      res.json({

        success:
          true,

        message:
          "Login successful",

        token,

        user: {

          id:
            user.id,

          name:
            user.name,

          email:
            user.email
        }
      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Login failed"
      });
    }
  }
);

// ============================================================
// ADMIN PASSWORD RESET
// POST /api/auth/admin-reset-password
// ============================================================

app.post(
  "/api/auth/admin-reset-password",
  async (req, res) => {

    try {

      const {
        email,
        resetCode,
        newPassword
      } = req.body;

      if (
        !email ||
        !resetCode ||
        !newPassword
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Email, reset code and new password are required"
        });
      }

      if (!ADMIN_RESET_CODE) {

        return res.status(503).json({

          success:
            false,

          message:
            "Password reset is not configured on the server"
        });
      }

      if (
        String(resetCode).trim() !==
        ADMIN_RESET_CODE
      ) {

        return res.status(403).json({

          success:
            false,

          message:
            "Invalid reset code"
        });
      }

      if (
        String(newPassword).length < 6
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "New password must be at least 6 characters"
        });
      }

      const cleanEmail =
        String(email)
          .trim()
          .toLowerCase();

      if (
        !ADMIN_EMAIL ||
        cleanEmail !==
        ADMIN_EMAIL
      ) {

        return res.status(403).json({

          success:
            false,

          message:
            "Password reset is only available for the admin account"
        });
      }

      const users =
        getUsers();

      const user =
        users.find(
          item =>
            item.email ===
            cleanEmail
        );

      if (!user) {

        return res.status(404).json({

          success:
            false,

          message:
            "Admin account not found"
        });
      }

      const passwordHash =
        await bcrypt.hash(
          String(newPassword),
          10
        );

      user.passwordHash =
        passwordHash;

      saveUsers(users);

      res.json({

        success:
          true,

        message:
          "Admin password reset successfully"
      });

    } catch (error) {

      console.error(
        "ADMIN PASSWORD RESET ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Password reset failed"
      });
    }
  }
);

// ============================================================
// PROFILE
// ============================================================

app.get(
  "/api/auth/me",
  authMiddleware,
  (req, res) => {

    const users =
      getUsers();

    const user =
      users.find(
        user =>
          user.id ===
          req.user.id
      );

    if (!user) {

      return res.status(404).json({

        success:
          false,

        message:
          "User not found"
      });
    }

    res.json({

      success:
        true,

      user: {

        id:
          user.id,

        name:
          user.name,

        email:
          user.email,

        createdAt:
          user.createdAt,

        lastLoginAt:
          user.lastLoginAt ||
          null
      }
    });
  }
);

// ============================================================
// LOGOUT
// ============================================================

app.post(
  "/api/auth/logout",
  authMiddleware,
  (req, res) => {

    res.json({

      success:
        true,

      message:
        "Logged out successfully"
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

      const chats =
        getChats();

      const now =
        new Date().toISOString();

      const chat = {

        id:
          crypto.randomUUID(),

        userId:
          req.user.id,

        title:
          title ||
          "New Chat",

        messages:
          Array.isArray(messages)
            ? messages
            : [],

        createdAt:
          now,

        updatedAt:
          now
      };

      chats.unshift(chat);

      saveChats(chats);

      res.json({

        success:
          true,

        chat
      });

    } catch (error) {

      console.error(
        "CREATE CHAT ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

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

    const chats =
      getChats();

    const userChats =
      chats
        .filter(
          chat =>
            chat.userId ===
            req.user.id
        )
        .sort(
          (a, b) =>
            new Date(
              b.updatedAt
            ) -
            new Date(
              a.updatedAt
            )
        );

    res.json({

      success:
        true,

      chats:
        userChats
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

    const chats =
      getChats();

    const chat =
      chats.find(
        chat =>
          chat.id ===
            req.params.id &&
          chat.userId ===
            req.user.id
      );

    if (!chat) {

      return res.status(404).json({

        success:
          false,

        message:
          "Chat not found"
      });
    }

    res.json({

      success:
        true,

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

    const chats =
      getChats();

    const index =
      chats.findIndex(
        chat =>
          chat.id ===
            req.params.id &&
          chat.userId ===
            req.user.id
      );

    if (index === -1) {

      return res.status(404).json({

        success:
          false,

        message:
          "Chat not found"
      });
    }

    if (
      req.body.title !==
      undefined
    ) {

      chats[index].title =
        req.body.title;
    }

    if (
      req.body.messages !==
      undefined
    ) {

      chats[index].messages =
        req.body.messages;
    }

    chats[index].updatedAt =
      new Date().toISOString();

    saveChats(chats);

    res.json({

      success:
        true,

      chat:
        chats[index]
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

    const chats =
      getChats();

    const oldLength =
      chats.length;

    const newChats =
      chats.filter(
        chat =>
          !(
            chat.id ===
              req.params.id &&
            chat.userId ===
              req.user.id
          )
      );

    if (
      newChats.length ===
      oldLength
    ) {

      return res.status(404).json({

        success:
          false,

        message:
          "Chat not found"
      });
    }

    saveChats(newChats);

    res.json({

      success:
        true,

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
      String(
        req.query.q || ""
      )
        .trim()
        .toLowerCase();

    const chats =
      getChats();

    const userChats =
      chats.filter(
        chat =>
          chat.userId ===
          req.user.id
      );

    if (!query) {

      return res.json({

        success:
          true,

        chats:
          userChats
      });
    }

    const results =
      userChats.filter(
        chat => {

          const titleMatch =
            String(
              chat.title || ""
            )
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
        }
      );

    res.json({

      success:
        true,

      chats:
        results
    });
  }
);

// ============================================================
// YOUTUBE VIDEO SEARCH
// ============================================================

app.get(
  "/api/video-search",
  authMiddleware,
  async (req, res) => {

    try {

      const query =
        String(
          req.query.q || ""
        ).trim();

      if (!query) {

        return res.status(400).json({

          success:
            false,

          message:
            "Video search query is required"
        });
      }

      if (!YOUTUBE_API_KEY) {

        return res.status(500).json({

          success:
            false,

          message:
            "YouTube search is not configured. Add YOUTUBE_API_KEY to the server environment."
        });
      }

      const params =
        new URLSearchParams({

          part:
            "snippet",

          q:
            query,

          type:
            "video",

          maxResults:
            "5",

          safeSearch:
            "moderate",

          videoEmbeddable:
            "true",

          key:
            YOUTUBE_API_KEY
        });

      const youtubeURL =
        "https://www.googleapis.com/youtube/v3/search?" +
        params.toString();

      const response =
        await fetch(
          youtubeURL
        );

      const data =
        await response.json();

      if (!response.ok) {

        console.error(
          "YOUTUBE API ERROR:",
          data
        );

        return res.status(
          response.status
        ).json({

          success:
            false,

          message:
            data?.error?.message ||
            "YouTube search failed"
        });
      }

      const items =
        Array.isArray(
          data.items
        )
          ? data.items
          : [];

      const video =
        items.find(
          item =>
            item &&
            item.id &&
            item.id.videoId
        );

      if (!video) {

        return res.json({

          success:
            true,

          video:
            null,

          message:
            `No video found for "${query}"`
        });
      }

      const videoId =
        video.id.videoId;

      const snippet =
        video.snippet || {};

      const thumbnail =
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        "";

      return res.json({

        success:
          true,

        video: {

          videoId:
            videoId,

          title:
            snippet.title ||
            query,

          description:
            snippet.description ||
            "",

          channelTitle:
            snippet.channelTitle ||
            "",

          publishedAt:
            snippet.publishedAt ||
            "",

          thumbnail:
            thumbnail,

          youtubeUrl:
            `https://www.youtube.com/watch?v=${videoId}`
        }
      });

    } catch (error) {

      console.error(
        "VIDEO SEARCH ERROR:",
        error
      );

      return res.status(500).json({

        success:
          false,

        message:
          "Video search failed",

        error:
          error.message
      });
    }
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
        message,
        chatId,
        mode,
        character,
        characterEmoji
      } = req.body;

      const userQuestion =
        String(
          question ||
          message ||
          ""
        ).trim();

      if (!userQuestion) {

        return res.status(400).json({

          success:
            false,

          message:
            "Question is required"
        });
      }

      if (
        !openai &&
        !groq
      ) {

        return res.status(500).json({

          success:
            false,

          message:
            "No AI API key is connected. Add OPENAI_API_KEY or GROQ_API_KEY to the server environment."
        });
      }

      const chats =
        getChats();

      let chat =
        null;

      let chatIndex =
        -1;

      if (chatId) {

        chatIndex =
          chats.findIndex(
            item =>
              item.id ===
                chatId &&
              item.userId ===
                req.user.id
          );

        if (
          chatIndex !==
          -1
        ) {

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
            userQuestion.substring(
              0,
              60
            ),

          messages: [],

          createdAt:
            new Date().toISOString(),

          updatedAt:
            new Date().toISOString()
        };

        chats.unshift(chat);

        chatIndex =
          0;
      }

      chat.messages.push({

        role:
          "user",

        content:
          userQuestion,

        timestamp:
          new Date().toISOString(),

        mode:
          mode ||
          "Default",

        character:
          character ||
          "",

        characterEmoji:
          characterEmoji ||
          ""
      });

      const recentMessages =
        chat.messages
          .slice(-24)
          .map(
            message => ({

              role:
                message.role,

              content:
                message.content
            })
          );

      const systemMessage = {

        role:
          "system",

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
- For maths, show calculations clearly.
- Keep answers well structured.
- Do not unnecessarily repeat the question.
- If you are unsure, say so.
- Never pretend to know something you do not know.
- Be friendly and easy to understand.

Formatting rules:

- Use clear headings.
- Prefer short paragraphs.
- Use bullet points for multiple items.
- Use numbered lists for steps.
- For school questions, explain like a teacher.
- Give examples when helpful.
- For difficult concepts, explain the basic idea first.
- If the user asks in Hindi or Hinglish, answer in Hindi/Hinglish.
- If the user asks in English, answer in English.
- Keep the answer easy to read.
`
      };

      let answer =
        "";

      let usedAI =
        "";

      // ========================================================
      // OPENAI PRIMARY
      // ========================================================

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

              temperature:
                0.3,

              max_tokens:
                4096
            });

          answer =
            completion
              .choices?.[0]
              ?.message
              ?.content ||
            "";

          if (answer) {

            usedAI =
              "OpenAI";
          }

        } catch (openAIError) {

          console.error(
            "OPENAI ERROR:",
            openAIError.message
          );
        }
      }

      // ========================================================
      // GROQ BACKUP
      // ========================================================

      if (
        !answer &&
        groq
      ) {

        try {

          const completion =
            await groq.chat.completions.create({

              model:
                "openai/gpt-oss-120b",

              messages: [
                systemMessage,
                ...recentMessages
              ],

              temperature:
                0.3,

              max_tokens:
                4096
            });

          answer =
            completion
              .choices?.[0]
              ?.message
              ?.content ||
            "";

          if (answer) {

            usedAI =
              "Groq";
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

          success:
            false,

          message:
            "Both AI services failed. Check your API keys."
        });
      }

      // ========================================================
      // SAVE ASSISTANT MESSAGE
      // ========================================================

      chat.messages.push({

        role:
          "assistant",

        content:
          answer,

        timestamp:
          new Date().toISOString(),

        mode:
          mode ||
          "Default",

        ai:
          usedAI,

        character:
          character ||
          "",

        characterEmoji:
          characterEmoji ||
          ""
      });

      chat.updatedAt =
        new Date().toISOString();

      if (
        chatIndex ===
        -1
      ) {

        chats.unshift(
          chat
        );

      } else {

        chats[chatIndex] =
          chat;
      }

      saveChats(
        chats
      );

      res.json({

        success:
          true,

        answer:
          answer,

        ai:
          usedAI,

        chatId:
          chat.id,

        chat:
          chat
      });

    } catch (error) {

      console.error(
        "AI ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

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

    const chats =
      getChats();

    const remaining =
      chats.filter(
        chat =>
          chat.userId !==
          req.user.id
      );

    saveChats(
      remaining
    );

    res.json({

      success:
        true,

      message:
        "All chats deleted"
    });
  }
);

// ============================================================
// ADMIN STATS
// ============================================================

app.get(
  "/api/admin/stats",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    try {

      const users =
        getUsers();

      const chats =
        getChats();

      let totalQuestions =
        0;

      let totalAnswers =
        0;

      chats.forEach(
        chat => {

          if (
            !Array.isArray(
              chat.messages
            )
          ) {
            return;
          }

          chat.messages.forEach(
            message => {

              if (
                message.role ===
                "user"
              ) {
                totalQuestions++;
              }

              if (
                message.role ===
                "assistant"
              ) {
                totalAnswers++;
              }
            }
          );
        }
      );

      const adminUser =
        users.find(
          user =>
            user.email ===
            ADMIN_EMAIL
        );

      res.json({

        success:
          true,

        stats: {

          totalUsers:
            users.length,

          totalChats:
            chats.length,

          totalQuestions:
            totalQuestions,

          totalAnswers:
            totalAnswers,

          adminEmail:
            ADMIN_EMAIL,

          adminUser:
            adminUser
              ? {

                  id:
                    adminUser.id,

                  name:
                    adminUser.name,

                  email:
                    adminUser.email

                }
              : null
        }
      });

    } catch (error) {

      console.error(
        "ADMIN STATS ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Could not load admin statistics"
      });
    }
  }
);

// ============================================================
// ADMIN USERS
// ============================================================

app.get(
  "/api/admin/users",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    try {

      const users =
        getUsers();

      const chats =
        getChats();

      const result =
        users.map(
          user => {

            const userChats =
              chats.filter(
                chat =>
                  chat.userId ===
                  user.id
              );

            let questionCount =
              0;

            let answerCount =
              0;

            userChats.forEach(
              chat => {

                if (
                  !Array.isArray(
                    chat.messages
                  )
                ) {
                  return;
                }

                chat.messages.forEach(
                  message => {

                    if (
                      message.role ===
                      "user"
                    ) {
                      questionCount++;
                    }

                    if (
                      message.role ===
                      "assistant"
                    ) {
                      answerCount++;
                    }
                  }
                );
              }
            );

            return {

              id:
                user.id,

              name:
                user.name,

              email:
                user.email,

              createdAt:
                user.createdAt,

              lastLoginAt:
                user.lastLoginAt ||
                null,

              chatCount:
                userChats.length,

              questionCount:
                questionCount,

              answerCount:
                answerCount,

              isAdmin:
                user.email ===
                ADMIN_EMAIL
            };
          }
        );

      result.sort(
        (a, b) =>
          new Date(
            b.createdAt
          ) -
          new Date(
            a.createdAt
          )
      );

      res.json({

        success:
          true,

        users:
          result
      });

    } catch (error) {

      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Could not load users"
      });
    }
  }
);

// ============================================================
// ADMIN ALL HISTORY
// ============================================================

app.get(
  "/api/admin/history",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    try {

      const users =
        getUsers();

      const chats =
        getChats();

      const history = [];

      chats.forEach(
        chat => {

          const user =
            users.find(
              item =>
                item.id ===
                chat.userId
            );

          if (
            !user ||
            !Array.isArray(
              chat.messages
            )
          ) {
            return;
          }

          chat.messages.forEach(
            message => {

              if (
                message.role !==
                "user"
              ) {
                return;
              }

              const timestamp =
                message.timestamp ||
                chat.updatedAt ||
                chat.createdAt;

              history.push({

                id:
                  crypto.randomUUID(),

                userId:
                  user.id,

                userName:
                  user.name,

                userEmail:
                  user.email,

                chatId:
                  chat.id,

                chatTitle:
                  chat.title ||
                  "New Chat",

                question:
                  message.content ||
                  "",

                time:
                  timestamp,

                mode:
                  message.mode ||
                  "Default",

                character:
                  message.character ||
                  "",

                characterEmoji:
                  message.characterEmoji ||
                  ""
              });
            }
          );
        }
      );

      history.sort(
        (a, b) =>
          new Date(
            b.time
          ) -
          new Date(
            a.time
          )
      );

      res.json({

        success:
          true,

        total:
          history.length,

        history:
          history
      });

    } catch (error) {

      console.error(
        "ADMIN HISTORY ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Could not load history"
      });
    }
  }
);

// ============================================================
// ADMIN USER HISTORY
// ============================================================

app.get(
  "/api/admin/users/:id/history",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    try {

      const users =
        getUsers();

      const chats =
        getChats();

      const user =
        users.find(
          item =>
            item.id ===
            req.params.id
        );

      if (!user) {

        return res.status(404).json({

          success:
            false,

          message:
            "User not found"
        });
      }

      const userChats =
        chats.filter(
          chat =>
            chat.userId ===
            user.id
        );

      const history = [];

      userChats.forEach(
        chat => {

          if (
            !Array.isArray(
              chat.messages
            )
          ) {
            return;
          }

          chat.messages.forEach(
            message => {

              history.push({

                chatId:
                  chat.id,

                chatTitle:
                  chat.title ||
                  "New Chat",

                role:
                  message.role,

                content:
                  message.content ||
                  "",

                timestamp:
                  message.timestamp ||
                  chat.updatedAt,

                mode:
                  message.mode ||
                  "Default",

                ai:
                  message.ai ||
                  "",

                character:
                  message.character ||
                  "",

                characterEmoji:
                  message.characterEmoji ||
                  ""
              });
            }
          );
        }
      );

      history.sort(
        (a, b) =>
          new Date(
            a.timestamp
          ) -
          new Date(
            b.timestamp
          )
      );

      res.json({

        success:
          true,

        user: {

          id:
            user.id,

          name:
            user.name,

          email:
            user.email,

          createdAt:
            user.createdAt,

          lastLoginAt:
            user.lastLoginAt ||
            null
        },

        totalChats:
          userChats.length,

        totalMessages:
          history.length,

        history:
          history
      });

    } catch (error) {

      console.error(
        "ADMIN USER HISTORY ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Could not load user history"
      });
    }
  }
);

// ============================================================
// ADMIN SINGLE CHAT
// ============================================================

app.get(
  "/api/admin/chats/:id",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    try {

      const users =
        getUsers();

      const chats =
        getChats();

      const chat =
        chats.find(
          item =>
            item.id ===
            req.params.id
        );

      if (!chat) {

        return res.status(404).json({

          success:
            false,

          message:
            "Chat not found"
        });
      }

      const user =
        users.find(
          item =>
            item.id ===
            chat.userId
        );

      res.json({

        success:
          true,

        user:
          user
            ? {

                id:
                  user.id,

                name:
                  user.name,

                email:
                  user.email

              }
            : null,

        chat:
          chat
      });

    } catch (error) {

      console.error(
        "ADMIN CHAT ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          "Could not load chat"
      });
    }
  }
);

// ============================================================
// ADMIN CHECK
// ============================================================

app.get(
  "/api/admin/check",
  authMiddleware,
  adminMiddleware,
  (req, res) => {

    res.json({

      success:
        true,

      admin:
        true,

      email:
        req.user.email
    });
  }
);

// ============================================================
// 404 API HANDLER
// ============================================================

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      success:
        false,

      message:
        "API endpoint not found"
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
      `Website:     http://localhost:${PORT}`
    );

    console.log(
      `API Status:  http://localhost:${PORT}/api/status`
    );

    console.log(
      `OpenAI:      ${
        openai
          ? "Connected"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      `Groq:        ${
        groq
          ? "Connected"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      `YouTube:     ${
        YOUTUBE_API_KEY
          ? "Connected"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      `AI:          ${
        openai || groq
          ? "Connected"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      `Admin:       ${
        ADMIN_EMAIL
          ? "Configured"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      `Password Reset: ${
        ADMIN_RESET_CODE
          ? "Configured"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      "Login:       Enabled"
    );

    console.log(
      "Chat History: Enabled"
    );

    console.log(
      "Chat Search: Enabled"
    );

    console.log(
      "Video Search: Enabled"
    );

    console.log(
      "Admin Dashboard API: Enabled"
    );

    console.log(
      "=========================================="
    );

    console.log("");
  }
);
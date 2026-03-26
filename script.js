// ===============================
// FIREBASE CONFIG
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCCZI0fFJjds2QdkWaYdeQSvXHZr0O3x_M",
  authDomain: "yashchat-b3d9a.firebaseapp.com",
  projectId: "yashchat-b3d9a",
  storageBucket: "yashchat-b3d9a.firebasestorage.app",
  messagingSenderId: "1036702979656",
  appId: "1:1036702979656:web:76ae7d17c2e577027eaa7d",
  measurementId: "G-TB7BMV9C35"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// ===============================
// DOM
// ===============================
const loginScreen = document.getElementById("loginScreen");
const chatScreen = document.getElementById("chatScreen");
const usernameInput = document.getElementById("usernameInput");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const currentUserEl = document.getElementById("currentUser");
const sidebarAvatar = document.getElementById("sidebarAvatar");
const userCountEl = document.getElementById("userCount");
const onlineUsersList = document.getElementById("onlineUsersList");
const msgContainer = document.getElementById("msgContainer");
const messagesWrapper = document.getElementById("messagesWrapper");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const typingIndicator = document.getElementById("typingIndicator");
const typingText = document.getElementById("typingText");
const typingAvatar = document.getElementById("typingAvatar");

// ===============================
// STATE
// ===============================
let currentUser = {
  id: "",
  name: ""
};

let typingTimer = null;
const DONE_TYPING_INTERVAL = 1200;
let renderedMessageIds = new Set();
let isInitialLoad = true;

// ===============================
// HELPERS
// ===============================
function sanitizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function sanitizeUsername(name) {
  return name
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTime(timestamp) {
  if (!timestamp) return "Now";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scrollToBottom(smooth = true) {
  msgContainer.scrollTo({
    top: msgContainer.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

function createSystemMessage(text) {
  const note = document.createElement("div");
  note.className = "system-note";
  note.textContent = text;
  msgContainer.appendChild(note);
}

function saveUsername(name) {
  localStorage.setItem("yashchat_username", name);
}

function loadSavedUsername() {
  return localStorage.getItem("yashchat_username") || "";
}

function setTypingVisible(show, username = "", avatar = "U") {
  if (show) {
    typingIndicator.classList.remove("hidden");
    typingText.textContent = `${username} is typing...`;
    typingAvatar.textContent = avatar;
  } else {
    typingIndicator.classList.add("hidden");
    typingText.textContent = "";
    typingAvatar.textContent = "U";
  }
}

// ===============================
// AUTH / INIT
// ===============================
async function initChat(username) {
  try {
    const cleanName = sanitizeUsername(username);

    if (!cleanName || cleanName.length < 2) {
      alert("Enter a valid display name (at least 2 characters).");
      return;
    }

    loginButton.disabled = true;
    loginButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Joining...`;

    const userCredential = await auth.signInAnonymously();

    currentUser.id = userCredential.user.uid;
    currentUser.name = cleanName;

    saveUsername(cleanName);

    currentUserEl.textContent = cleanName;
    sidebarAvatar.textContent = getInitials(cleanName);

    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    setupPresence();
    setupUsersListener();
    setupMessageListener();
    setupTypingListener();

    messageInput.focus();
  } catch (error) {
    console.error("Error initializing chat:", error);
    alert("Couldn't connect to chat. Firebase decided to be dramatic.");
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Start Chatting`;
  }
}

function setupPresence() {
  const userRef = database.ref(`users/${currentUser.id}`);
  const connectedRef = database.ref(".info/connected");

  connectedRef.on("value", async (snap) => {
    if (snap.val() === true) {
      await userRef.onDisconnect().set({
        username: currentUser.name,
        online: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });

      await database.ref(`typing/${currentUser.id}`).onDisconnect().remove();

      await userRef.set({
        username: currentUser.name,
        online: true,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });
    }
  });
}

// ===============================
// USERS / ONLINE LIST
// ===============================
function setupUsersListener() {
  database.ref("users").on("value", (snapshot) => {
    const users = snapshot.val() || {};
    const onlineUsers = Object.entries(users)
      .filter(([_, user]) => user.online)
      .map(([id, user]) => ({ id, ...user }));

    userCountEl.textContent = onlineUsers.length;
    renderOnlineUsers(onlineUsers);
  });
}

function renderOnlineUsers(users) {
  onlineUsersList.innerHTML = "";

  if (!users.length) {
    onlineUsersList.innerHTML = `<p class="status">No one online. Humanity took a break.</p>`;
    return;
  }

  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "online-user-item";

    item.innerHTML = `
      <div class="avatar">${getInitials(user.username)}</div>
      <div>
        <div class="username">${escapeHtml(user.username)} ${user.id === currentUser.id ? "(You)" : ""}</div>
        <div class="online-user-meta">
          <span class="dot online"></span> Online
        </div>
      </div>
    `;

    onlineUsersList.appendChild(item);
  });
}

// ===============================
// MESSAGES
// ===============================
function setupMessageListener() {
  database.ref("messages").limitToLast(100).on("child_added", (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();

    if (renderedMessageIds.has(messageId)) return;
    renderedMessageIds.add(messageId);

    displayMessage(message);

    if (isInitialLoad) {
      setTimeout(() => scrollToBottom(false), 50);
    } else {
      scrollToBottom(true);
    }
  });

  database.ref("messages").limitToLast(100).once("value", () => {
    isInitialLoad = false;
  });
}

function displayMessage(message) {
  if (!message) return;

  if (message.type === "system") {
    createSystemMessage(message.text);
    return;
  }

  const isMine = message.userId === currentUser.id;
  const row = document.createElement("div");
  row.className = `message-row ${isMine ? "sent" : "received"}`;

  row.innerHTML = `
    <div class="message-avatar">${getInitials(message.username)}</div>
    <div class="message-content">
      <div class="message-meta">
        <span class="message-username">${escapeHtml(message.username || "Unknown")}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="bubble">${escapeHtml(message.text || "")}</div>
    </div>
  `;

  msgContainer.appendChild(row);
}

async function sendMessage() {
  const messageText = sanitizeText(messageInput.value);

  if (!messageText || !currentUser.id) return;

  sendButton.disabled = true;

  try {
    await database.ref("messages").push({
      userId: currentUser.id,
      username: currentUser.name,
      text: messageText,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    messageInput.value = "";
    await updateTypingStatus(false);
    scrollToBottom(true);
  } catch (error) {
    console.error("Error sending message:", error);
    alert("Message failed to send. The internet remains a disappointing invention.");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

// ===============================
// TYPING
// ===============================
function setupTypingListener() {
  database.ref("typing").on("value", (snapshot) => {
    const typingData = snapshot.val() || {};
    const typingUsers = Object.values(typingData).filter(
      (user) => user.isTyping && user.userId !== currentUser.id
    );

    if (typingUsers.length > 0) {
      const activeUser = typingUsers[0];
      setTypingVisible(true, activeUser.username, getInitials(activeUser.username));
    } else {
      setTypingVisible(false);
    }
  });
}

async function updateTypingStatus(isTyping) {
  if (!currentUser.id) return;

  try {
    if (isTyping) {
      await database.ref(`typing/${currentUser.id}`).set({
        userId: currentUser.id,
        username: currentUser.name,
        isTyping: true,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } else {
      await database.ref(`typing/${currentUser.id}`).remove();
    }
  } catch (error) {
    console.error("Typing status error:", error);
  }
}

// ===============================
// ESCAPE HTML
// ===============================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===============================
// LOGOUT
// ===============================
async function logout() {
  try {
    if (currentUser.id) {
      await database.ref(`typing/${currentUser.id}`).remove();
      await database.ref(`users/${currentUser.id}`).update({
        online: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });
    }

    await auth.signOut();

    currentUser = { id: "", name: "" };
    renderedMessageIds.clear();
    msgContainer.innerHTML = "";
    onlineUsersList.innerHTML = "";

    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");

    usernameInput.value = loadSavedUsername();
    setTypingVisible(false);
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// ===============================
// EVENTS
// ===============================
loginButton.addEventListener("click", () => {
  initChat(usernameInput.value);
});

usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    initChat(usernameInput.value);
  }
});

sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", async () => {
  clearTimeout(typingTimer);

  if (messageInput.value.trim()) {
    await updateTypingStatus(true);
  } else {
    await updateTypingStatus(false);
  }

  typingTimer = setTimeout(() => {
    updateTypingStatus(false);
  }, DONE_TYPING_INTERVAL);
});

messageInput.addEventListener("blur", () => {
  updateTypingStatus(false);
});

logoutButton.addEventListener("click", logout);

window.addEventListener("beforeunload", () => {
  if (currentUser.id) {
    database.ref(`typing/${currentUser.id}`).remove();
    database.ref(`users/${currentUser.id}`).update({
      online: false,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });
  }
});

window.addEventListener("load", () => {
  const saved = loadSavedUsername();
  if (saved) usernameInput.value = saved;
});
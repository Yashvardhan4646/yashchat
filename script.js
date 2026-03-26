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
// CLOUDINARY PLACEHOLDER CONFIG
// Replace later with your actual values
// ===============================
const CLOUDINARY_CLOUD_NAME = "dcfdaifom";
const CLOUDINARY_UPLOAD_PRESET = "yashchat_upload";

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

const roomsList = document.getElementById("roomsList");
const createRoomBtn = document.getElementById("createRoomBtn");
const createRoomBox = document.getElementById("createRoomBox");
const newRoomInput = document.getElementById("newRoomInput");
const confirmCreateRoomBtn = document.getElementById("confirmCreateRoomBtn");

const roomTitle = document.getElementById("roomTitle");
const roomSubtitle = document.getElementById("roomSubtitle");

const msgContainer = document.getElementById("msgContainer");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const imageInput = document.getElementById("imageInput");

const toggleEmojiBtn = document.getElementById("toggleEmojiBtn");
const emojiBar = document.getElementById("emojiBar");

const typingIndicator = document.getElementById("typingIndicator");
const typingText = document.getElementById("typingText");
const typingAvatar = document.getElementById("typingAvatar");

// ===============================
// STATE
// ===============================
let currentUser = { id: "", name: "" };
let currentRoom = "global";
let typingTimer = null;
const DONE_TYPING_INTERVAL = 1200;

let renderedMessageIds = new Set();
let messagesListenerRef = null;
let typingListenerRef = null;

// ===============================
// HELPERS
// ===============================
function sanitizeText(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function sanitizeUsername(name) {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function sanitizeRoomName(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
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
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scrollToBottom(smooth = true) {
  msgContainer.scrollTo({
    top: msgContainer.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

function roomPath(path = "") {
  return `rooms/${currentRoom}${path ? "/" + path : ""}`;
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
  }
}

function createSystemMessage(text) {
  const note = document.createElement("div");
  note.className = "system-note";
  note.textContent = text;
  msgContainer.appendChild(note);
}

// ===============================
// AUTH / INIT
// ===============================
async function initChat(username) {
  try {
    const cleanName = sanitizeUsername(username);

    if (!cleanName || cleanName.length < 2) {
      alert("Enter a valid display name.");
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

    await ensureGlobalRoom();
    await setupPresence();
    setupUsersListener();
    setupRoomsListener();
    switchRoom("global");

    messageInput.focus();
  } catch (error) {
    console.error(error);
    alert("Couldn't connect to chat.");
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Join Chat`;
  }
}

async function ensureGlobalRoom() {
  await database.ref("rooms/global/info").update({
    name: "global",
    createdBy: "system",
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    isPublic: true
  });
}

async function setupPresence() {
  const userRef = database.ref(`users/${currentUser.id}`);
  const connectedRef = database.ref(".info/connected");

  connectedRef.on("value", async (snap) => {
    if (snap.val() === true) {
      await userRef.onDisconnect().set({
        username: currentUser.name,
        online: false,
        currentRoom: currentRoom,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });

      await database.ref(roomPath(`typing/${currentUser.id}`)).onDisconnect().remove();
      await database.ref(roomPath(`members/${currentUser.id}`)).onDisconnect().remove();

      await userRef.set({
        username: currentUser.name,
        online: true,
        currentRoom: currentRoom,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });

      await database.ref(roomPath(`members/${currentUser.id}`)).set(true);
    }
  });
}

// ===============================
// USERS
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
    onlineUsersList.innerHTML = `<p class="subline">No one online.</p>`;
    return;
  }

  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "online-user-item";
    item.innerHTML = `
      <div class="avatar">${getInitials(user.username)}</div>
      <div>
        <div class="username">${escapeHtml(user.username)} ${user.id === currentUser.id ? "(You)" : ""}</div>
        <div class="online-user-meta"><span class="online-dot"></span> ${escapeHtml(user.currentRoom || "global")}</div>
      </div>
    `;
    onlineUsersList.appendChild(item);
  });
}

// ===============================
// ROOMS
// ===============================
function setupRoomsListener() {
  database.ref("rooms").on("value", (snapshot) => {
    const rooms = snapshot.val() || {};
    renderRooms(rooms);
  });
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";

  Object.entries(rooms).forEach(([roomId, roomData]) => {
    const roomName = roomData?.info?.name || roomId;
    const item = document.createElement("div");
    item.className = `room-item ${roomId === currentRoom ? "active" : ""}`;
    item.innerHTML = `
      <div class="avatar">#</div>
      <div>
        <div class="username">${escapeHtml(roomName)}</div>
        <div class="subline">${roomId === "global" ? "Public default room" : "Custom room"}</div>
      </div>
    `;

    item.addEventListener("click", () => switchRoom(roomId));
    roomsList.appendChild(item);
  });
}

async function createRoom() {
  const roomNameRaw = newRoomInput.value.trim();
  const roomId = sanitizeRoomName(roomNameRaw);

  if (!roomId || roomId.length < 2) {
    alert("Enter a valid room name.");
    return;
  }

  const roomRef = database.ref(`rooms/${roomId}`);
  const snapshot = await roomRef.child("info").once("value");

  if (snapshot.exists()) {
    alert("Room already exists.");
    return;
  }

  await roomRef.child("info").set({
    name: roomId,
    createdBy: currentUser.id,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    isPublic: true
  });

  await roomRef.child("messages").push({
    type: "system",
    text: `${currentUser.name} created #${roomId}`,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  newRoomInput.value = "";
  createRoomBox.classList.add("hidden");
  switchRoom(roomId);
}

async function switchRoom(roomId) {
  if (roomId === currentRoom && messagesListenerRef) return;

  // Cleanup old listeners
  if (messagesListenerRef) messagesListenerRef.off();
  if (typingListenerRef) typingListenerRef.off();

  await updateTypingStatus(false);

  if (currentUser.id) {
    await database.ref(`rooms/${currentRoom}/members/${currentUser.id}`).remove().catch(() => {});
    await database.ref(`rooms/${roomId}/members/${currentUser.id}`).set(true).catch(() => {});
    await database.ref(`users/${currentUser.id}`).update({
      currentRoom: roomId,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });
  }

  currentRoom = roomId;
  renderedMessageIds.clear();
  msgContainer.innerHTML = "";

  roomTitle.textContent = roomId;
  roomSubtitle.textContent = roomId === "global" ? "Global room" : "Custom room";

  setupMessageListener();
  setupTypingListener();

  setTimeout(() => scrollToBottom(false), 200);
}

// ===============================
// MESSAGES
// ===============================
function setupMessageListener() {
  messagesListenerRef = database.ref(roomPath("messages"));

  messagesListenerRef.limitToLast(100).on("child_added", (snapshot) => {
    const messageId = snapshot.key;
    const message = snapshot.val();

    if (renderedMessageIds.has(messageId)) return;
    renderedMessageIds.add(messageId);

    displayMessage(messageId, message);
    scrollToBottom(true);
  });
}

function displayMessage(messageId, message) {
  if (!message) return;

  if (message.type === "system") {
    createSystemMessage(message.text);
    return;
  }

  const isMine = message.userId === currentUser.id;
  const row = document.createElement("div");
  row.className = `message-row ${isMine ? "sent" : "received"}`;

  const imageHtml = message.imageUrl
    ? `<img src="${message.imageUrl}" class="message-image" alt="Uploaded image" />`
    : "";

  row.innerHTML = `
    <div class="avatar small-avatar">${getInitials(message.username)}</div>
    <div class="message-content">
      <div class="message-meta">
        <span class="message-username">${escapeHtml(message.username || "Unknown")}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="bubble">
        ${message.text ? escapeHtml(message.text) : ""}
        ${imageHtml}
      </div>
      <div class="message-actions" id="actions-${messageId}"></div>
    </div>
  `;

  msgContainer.appendChild(row);
  renderReactions(messageId, message.reactions || {});
  addReactionButtons(messageId);
}

async function sendMessage(imageUrl = "") {
  const messageText = sanitizeText(messageInput.value);

  if (!messageText && !imageUrl) return;
  if (!currentUser.id) return;

  sendButton.disabled = true;

  try {
    await database.ref(roomPath("messages")).push({
      userId: currentUser.id,
      username: currentUser.name,
      text: messageText,
      imageUrl: imageUrl || "",
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    messageInput.value = "";
    await updateTypingStatus(false);
    scrollToBottom(true);
  } catch (error) {
    console.error(error);
    alert("Failed to send message.");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

// ===============================
// REACTIONS
// ===============================
const quickReactions = ["❤️", "🔥", "😂", "💀", "👍", "👀"];

function addReactionButtons(messageId) {
  const actions = document.getElementById(`actions-${messageId}`);
  if (!actions) return;

  quickReactions.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.className = "react-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", () => toggleReaction(messageId, emoji));
    actions.appendChild(btn);
  });

  database.ref(roomPath(`messages/${messageId}/reactions`)).on("value", (snapshot) => {
    renderReactions(messageId, snapshot.val() || {});
  });
}

function renderReactions(messageId, reactions) {
  const actions = document.getElementById(`actions-${messageId}`);
  if (!actions) return;

  const oldPills = actions.querySelectorAll(".reaction-pill");
  oldPills.forEach((pill) => pill.remove());

  const grouped = {};

  Object.entries(reactions).forEach(([uid, emoji]) => {
    if (!grouped[emoji]) grouped[emoji] = [];
    grouped[emoji].push(uid);
  });

  Object.entries(grouped).forEach(([emoji, users]) => {
    const pill = document.createElement("button");
    pill.className = `reaction-pill ${users.includes(currentUser.id) ? "active" : ""}`;
    pill.innerHTML = `${emoji} <span>${users.length}</span>`;
    pill.addEventListener("click", () => toggleReaction(messageId, emoji));
    actions.appendChild(pill);
  });
}

async function toggleReaction(messageId, emoji) {
  const reactionRef = database.ref(roomPath(`messages/${messageId}/reactions/${currentUser.id}`));
  const snap = await reactionRef.once("value");

  if (snap.exists() && snap.val() === emoji) {
    await reactionRef.remove();
  } else {
    await reactionRef.set(emoji);
  }
}

// ===============================
// TYPING
// ===============================
function setupTypingListener() {
  typingListenerRef = database.ref(roomPath("typing"));

  typingListenerRef.on("value", (snapshot) => {
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

  const typingRef = database.ref(roomPath(`typing/${currentUser.id}`));

  try {
    if (isTyping) {
      await typingRef.set({
        userId: currentUser.id,
        username: currentUser.name,
        isTyping: true,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } else {
      await typingRef.remove();
    }
  } catch (error) {
    console.error(error);
  }
}

// ===============================
// CLOUDINARY IMAGE UPLOAD
// ===============================
async function uploadImageToCloudinary(file) {
  if (!file) return null;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!data.secure_url) {
      throw new Error("Upload failed");
    }

    return data.secure_url;
  } catch (error) {
    console.error(error);
    alert("Image upload failed. Add your Cloudinary keys properly, mortal.");
    return null;
  }
}

// ===============================
// LOGOUT
// ===============================
async function logout() {
  try {
    if (currentUser.id) {
      await database.ref(roomPath(`typing/${currentUser.id}`)).remove();
      await database.ref(roomPath(`members/${currentUser.id}`)).remove();

      await database.ref(`users/${currentUser.id}`).update({
        online: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });
    }

    await auth.signOut();

    currentUser = { id: "", name: "" };
    currentRoom = "global";
    renderedMessageIds.clear();

    msgContainer.innerHTML = "";
    roomsList.innerHTML = "";
    onlineUsersList.innerHTML = "";

    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");

    usernameInput.value = loadSavedUsername();
    setTypingVisible(false);
  } catch (error) {
    console.error(error);
  }
}

// ===============================
// EVENTS
// ===============================
loginButton.addEventListener("click", () => initChat(usernameInput.value));

usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") initChat(usernameInput.value);
});

sendButton.addEventListener("click", () => sendMessage());

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

messageInput.addEventListener("blur", () => updateTypingStatus(false));

logoutButton.addEventListener("click", logout);

// Emoji bar toggle
toggleEmojiBtn.addEventListener("click", () => {
  emojiBar.classList.toggle("hidden");
});

// Insert emoji into input
document.querySelectorAll(".emoji-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    messageInput.value += btn.textContent;
    messageInput.focus();
  });
});

// Room create UI
createRoomBtn.addEventListener("click", () => {
  createRoomBox.classList.toggle("hidden");
});

confirmCreateRoomBtn.addEventListener("click", createRoom);

newRoomInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") createRoom();
});

// Image upload
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  sendButton.disabled = true;
  sendButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  const imageUrl = await uploadImageToCloudinary(file);

  if (imageUrl) {
    await sendMessage(imageUrl);
  }

  sendButton.disabled = false;
  sendButton.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
  imageInput.value = "";
});

window.addEventListener("beforeunload", () => {
  if (currentUser.id) {
    database.ref(roomPath(`typing/${currentUser.id}`)).remove();
    database.ref(roomPath(`members/${currentUser.id}`)).remove();
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
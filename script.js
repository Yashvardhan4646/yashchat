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
// CLOUDINARY
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
const logoutButtonMobile = document.getElementById("logoutButtonMobile");

const currentUserEl = document.getElementById("currentUser");
const sidebarAvatar = document.getElementById("sidebarAvatar");
const userCountEl = document.getElementById("userCount");
const onlineUsersList = document.getElementById("onlineUsersList");

const roomsList = document.getElementById("roomsList");
const createRoomBtn = document.getElementById("createRoomBtn");
const createRoomBox = document.getElementById("createRoomBox");
const newRoomInput = document.getElementById("newRoomInput");
const confirmCreateRoomBtn = document.getElementById("confirmCreateRoomBtn");
const roomPrivacySelect = document.getElementById("roomPrivacySelect");
const roomPasswordInput = document.getElementById("roomPasswordInput");

const joinInviteBtn = document.getElementById("joinInviteBtn");
const joinInviteBox = document.getElementById("joinInviteBox");
const inviteLinkInput = document.getElementById("inviteLinkInput");
const confirmJoinInviteBtn = document.getElementById("confirmJoinInviteBtn");
const copyInviteBtn = document.getElementById("copyInviteBtn");

const roomTitle = document.getElementById("roomTitle");
const roomSubtitle = document.getElementById("roomSubtitle");
const mobileRoomTitle = document.getElementById("mobileRoomTitle");

const msgContainer = document.getElementById("msgContainer");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const imageInput = document.getElementById("imageInput");

const toggleEmojiBtn = document.getElementById("toggleEmojiBtn");
const emojiBar = document.getElementById("emojiBar");

const typingIndicator = document.getElementById("typingIndicator");
const typingText = document.getElementById("typingText");

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");

// ===============================
// STATE
// ===============================
let currentUser = { id: "", name: "" };
let currentRoom = "global";
let currentRoomInfo = { name: "global", isPrivate: false };
let typingTimer = null;
const DONE_TYPING_INTERVAL = 1200;

let renderedMessageIds = new Set();
let messagesListenerRef = null;
let typingListenerRef = null;
let reactionsRefs = [];

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

function saveJoinedPrivateRoom(roomId) {
  const key = `yashchat_joined_${roomId}`;
  localStorage.setItem(key, "true");
}

function hasJoinedPrivateRoom(roomId) {
  return localStorage.getItem(`yashchat_joined_${roomId}`) === "true";
}

function setTypingVisible(show, username = "") {
  if (show) {
    typingIndicator.classList.remove("hidden");
    typingText.textContent = `${username} is typing...`;
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

function generateInviteCode(roomId, password = "") {
  return btoa(JSON.stringify({ roomId, password }));
}

function parseInviteCode(input) {
  try {
    if (input.includes("?invite=")) {
      input = new URL(input).searchParams.get("invite");
    }
    return JSON.parse(atob(input));
  } catch {
    return null;
  }
}

function updateRoomHeader() {
  const label = currentRoomInfo?.name || currentRoom;
  const isPrivate = currentRoomInfo?.isPrivate;

  roomTitle.textContent = label;
  mobileRoomTitle.textContent = `# ${label}`;
  roomSubtitle.textContent = isPrivate
    ? "Private room"
    : currentRoom === "global"
    ? "Global room"
    : "Public room";
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
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
    await switchRoom("global");

    checkInviteInURL();

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
    isPublic: true,
    isPrivate: false,
    password: ""
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
    const info = roomData?.info || {};
    const roomName = info.name || roomId;
    const isPrivate = !!info.isPrivate;
    const membersCount = roomData?.members ? Object.keys(roomData.members).length : 0;

    if (isPrivate && roomId !== currentRoom && !hasJoinedPrivateRoom(roomId)) {
      return;
    }

    const item = document.createElement("div");
    item.className = `room-item ${roomId === currentRoom ? "active" : ""}`;
    item.innerHTML = `
      <div class="avatar">${isPrivate ? "🔒" : "#"}</div>
      <div>
        <div class="username">${escapeHtml(roomName)}</div>
        <div class="room-badges">
          <span class="room-badge">${isPrivate ? "Private" : "Public"}</span>
          <span class="room-badge">${membersCount} online</span>
        </div>
      </div>
    `;

    item.addEventListener("click", async () => {
      if (isPrivate && !hasJoinedPrivateRoom(roomId) && roomId !== currentRoom) {
        const entered = prompt(`Enter password for #${roomName}`);
        if (entered === null) return;

        if (entered !== info.password) {
          alert("Wrong password.");
          return;
        }

        saveJoinedPrivateRoom(roomId);
      }

      await switchRoom(roomId);
      closeSidebar();
    });

    roomsList.appendChild(item);
  });
}

async function createRoom() {
  const roomNameRaw = newRoomInput.value.trim();
  const roomId = sanitizeRoomName(roomNameRaw);
  const privacy = roomPrivacySelect.value;
  const password = roomPasswordInput.value.trim();

  if (!roomId || roomId.length < 2) {
    alert("Enter a valid room name.");
    return;
  }

  if (privacy === "private" && password.length < 4) {
    alert("Private room password must be at least 4 characters.");
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
    isPublic: privacy === "public",
    isPrivate: privacy === "private",
    password: privacy === "private" ? password : ""
  });

  await roomRef.child("messages").push({
    type: "system",
    text: `${currentUser.name} created ${privacy === "private" ? "private" : "public"} room #${roomId}`,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  if (privacy === "private") {
    saveJoinedPrivateRoom(roomId);
  }

  newRoomInput.value = "";
  roomPasswordInput.value = "";
  createRoomBox.classList.add("hidden");

  await switchRoom(roomId);
}

async function switchRoom(roomId) {
  if (roomId === currentRoom && messagesListenerRef) return;

  if (messagesListenerRef) messagesListenerRef.off();
  if (typingListenerRef) typingListenerRef.off();
  reactionsRefs.forEach(ref => ref.off());
  reactionsRefs = [];

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

  const roomInfoSnap = await database.ref(`rooms/${roomId}/info`).once("value");
  currentRoomInfo = roomInfoSnap.val() || { name: roomId, isPrivate: false };

  updateRoomHeader();
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
    <div class="message-avatar">${getInitials(message.username)}</div>

    <div class="message-stack">
      <div class="message-meta">
        ${!isMine ? `<span class="message-username">${escapeHtml(message.username || "Unknown")}</span>` : ""}
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>

      <div class="bubble">
        ${message.text ? `<span class="message-text">${escapeHtml(message.text)}</span>` : ""}
        ${imageHtml}
      </div>

      <div class="reactions-row" id="reactions-${messageId}"></div>
      <div class="message-tools" id="tools-${messageId}"></div>
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
  const tools = document.getElementById(`tools-${messageId}`);
  if (!tools) return;

  tools.innerHTML = "";

  quickReactions.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.className = "react-btn";
    btn.textContent = emoji;
    btn.title = `React with ${emoji}`;
    btn.addEventListener("click", () => toggleReaction(messageId, emoji));
    tools.appendChild(btn);
  });

  database.ref(roomPath(`messages/${messageId}/reactions`)).on("value", (snapshot) => {
    renderReactions(messageId, snapshot.val() || {});
  });
}

function renderReactions(messageId, reactions) {
  const reactionsRow = document.getElementById(`reactions-${messageId}`);
  if (!reactionsRow) return;

  reactionsRow.innerHTML = "";

  const grouped = {};

  Object.entries(reactions).forEach(([uid, emoji]) => {
    if (!grouped[emoji]) grouped[emoji] = [];
    grouped[emoji].push(uid);
  });

  Object.entries(grouped).forEach(([emoji, users]) => {
    const pill = document.createElement("button");
    pill.className = `reaction-pill ${users.includes(currentUser.id) ? "active" : ""}`;
    pill.innerHTML = `${emoji} <span>${users.length}</span>`;
    pill.title = `${users.length} reaction${users.length > 1 ? "s" : ""}`;
    pill.addEventListener("click", () => toggleReaction(messageId, emoji));
    reactionsRow.appendChild(pill);
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
      setTypingVisible(true, activeUser.username);
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
    alert("Image upload failed. Your Cloudinary is having a personality disorder.");
    return null;
  }
}

// ===============================
// INVITES
// ===============================
function copyCurrentRoomInvite() {
  if (!currentRoom || currentRoom === "global") {
    alert("Global room doesn't need an invite.");
    return;
  }

  const password = currentRoomInfo?.password || "";
  const code = generateInviteCode(currentRoom, password);
  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${code}`;

  navigator.clipboard.writeText(inviteUrl)
    .then(() => alert("Invite link copied. Humanity survives another day."))
    .catch(() => alert(`Copy failed. Use this manually:\n${inviteUrl}`));
}

async function joinRoomFromInvite() {
  const raw = inviteLinkInput.value.trim();
  if (!raw) return alert("Paste an invite first.");

  const parsed = parseInviteCode(raw);
  if (!parsed?.roomId) {
    alert("Invalid invite link/code.");
    return;
  }

  const infoSnap = await database.ref(`rooms/${parsed.roomId}/info`).once("value");
  if (!infoSnap.exists()) {
    alert("Room not found.");
    return;
  }

  const info = infoSnap.val();

  if (info.isPrivate && info.password !== parsed.password) {
    alert("Invite password mismatch.");
    return;
  }

  saveJoinedPrivateRoom(parsed.roomId);
  inviteLinkInput.value = "";
  joinInviteBox.classList.add("hidden");
  await switchRoom(parsed.roomId);
  closeSidebar();
}

function checkInviteInURL() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite");
  if (!invite) return;

  inviteLinkInput.value = invite;
  joinRoomFromInvite();

  params.delete("invite");
  const cleanUrl = `${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
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
    currentRoomInfo = { name: "global", isPrivate: false };
    renderedMessageIds.clear();

    if (messagesListenerRef) messagesListenerRef.off();
    if (typingListenerRef) typingListenerRef.off();
    reactionsRefs.forEach(ref => ref.off());
    reactionsRefs = [];

    msgContainer.innerHTML = "";
    roomsList.innerHTML = "";
    onlineUsersList.innerHTML = "";

    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");

    usernameInput.value = loadSavedUsername();
    setTypingVisible(false);
    closeSidebar();
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
logoutButtonMobile.addEventListener("click", logout);

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
  joinInviteBox.classList.add("hidden");
});

joinInviteBtn.addEventListener("click", () => {
  joinInviteBox.classList.toggle("hidden");
  createRoomBox.classList.add("hidden");
});

roomPrivacySelect.addEventListener("change", () => {
  roomPasswordInput.classList.toggle("hidden", roomPrivacySelect.value !== "private");
});

confirmCreateRoomBtn.addEventListener("click", createRoom);
confirmJoinInviteBtn.addEventListener("click", joinRoomFromInvite);

newRoomInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") createRoom();
});

inviteLinkInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinRoomFromInvite();
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

// Invite copy
copyInviteBtn.addEventListener("click", copyCurrentRoomInvite);

// Mobile sidebar
mobileSidebarToggle.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

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
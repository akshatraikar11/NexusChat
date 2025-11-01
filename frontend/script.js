const APP_NAME = "NexusChat";
const chat = document.querySelector(".chat");
const chatWindow = document.querySelector(".chat-window");
const roomTabs = document.querySelector(".room-tabs");
const clearBtn = document.querySelector(".clear-chat");
const modal = document.querySelector(".modal-overlay");
const adminInput = document.querySelector(".admin-token-input");
const errorText = document.querySelector(".error-text");
const confirmClear = document.querySelector(".confirm-clear");
const cancelClear = document.querySelector(".cancel-clear");
const openAdminBtn = document.querySelector(".open-admin");
const verifyBtn = document.querySelector(".verify-admin");
const usernameInput = document.querySelector(".username-input");
const saveUsernameBtn = document.querySelector(".save-username");
const usernameError = document.querySelector(".username-error");
let chatHistory = [];
let rooms = ["general", "support", "random"];
let currentRoom = "general";

const socket = io();
let isAdmin = false;

// Apply stored custom name once connected
socket.on("connect", () => {
  try {
    const stored = localStorage.getItem("CUSTOM_USERNAME");
    if (stored && usernameInput) {
      usernameInput.value = stored;
    }
    if (stored) {
      emitSetUsername(stored);
    }
  } catch {}
});

socket.on("receive-messages", (data) => {
  const { chatHistory, username, rooms: incomingRooms, currentRoom: incomingRoom } = data || {};
  if (username !== undefined) updateUsername(username);
  if (Array.isArray(incomingRooms)) rooms = incomingRooms;
  if (typeof incomingRoom === "string") currentRoom = incomingRoom;
  renderRooms(rooms, currentRoom);
  updateRoomHeader(currentRoom);
  render(chatHistory);
});

// Attempt admin verification using stored token
verifyAdminFromStorage();

chat.addEventListener("submit", function (e) {
  e.preventDefault();
  sendMessage(chat.elements.message.value);
  chat.elements.message.value = "";
});

async function sendMessage(message) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  socket.emit("post-message", { message: text });
}

function render(chatHistory) {
  const html = chatHistory
    .map(function ({ username, message, createdAt }) {
      return messageTemplate(username, message, createdAt);
    })
    .join("\n");
  chatWindow.innerHTML = html;
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function updateUsername(username) {
  document.querySelector("h1").innerHTML = username;
}

function updateRoomHeader(room) {
  const header = document.querySelector("h2");
  header.textContent = `${APP_NAME} — ${room}`;
}

function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function messageTemplate(username, message, createdAt) {
  const time = formatTime(createdAt);
  const isCodeBlock = typeof message === "string" && message.startsWith("```") && message.endsWith("```");
  const content = isCodeBlock
    ? `<pre class="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto whitespace-pre-wrap font-mono"><code>${message.slice(3, -3)}</code></pre>`
    : `<p class="text-gray-100 text-lg">${username}: ${message}
        ${time ? `<span class="text-gray-400 text-sm ml-2">(${time})</span>` : ""}
      </p>`;

  return `
    <div class="flex items-start">
      <div class="w-5 h-5 bg-green-400 text-white rounded-full flex items-center justify-center mr-2 mt-1">
        <i class="fas fa-user"></i>
      </div>
      <div class="flex-1">${content}</div>
    </div>
  `;
}

function renderRooms(rooms, active) {
  const html = rooms
    .map((room) => {
      const isActive = room === active;
      const base = "px-3 py-1 rounded-full text-sm font-semibold cursor-pointer";
      const cls = isActive ? "bg-blue-600 text-white" : "bg-gray-700 text-white hover:bg-gray-500";
      return `<button class="${base} ${cls}" data-room="${room}">${room}</button>`;
    })
    .join("\n");
  roomTabs.innerHTML = html;
  Array.from(roomTabs.querySelectorAll("button[data-room]"))
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const room = btn.dataset.room;
        if (!room || room === currentRoom) return;
        socket.emit("join-room", { room });
      });
    });
}

// Modal helpers
function openClearModal() {
  if (!modal) return;
  if (errorText) {
    errorText.textContent = "";
    errorText.classList.add("hidden");
  }
  if (adminInput) {
    adminInput.value = localStorage.getItem("ADMIN_TOKEN") || "";
  }
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeClearModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// Wire Clear Room button to open modal
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    openClearModal();
  });
}

// Wire Admin button to open modal (for non-admins)
if (openAdminBtn) {
  openAdminBtn.addEventListener("click", () => {
    openClearModal();
  });
}

// Modal interactions
if (cancelClear) {
  cancelClear.addEventListener("click", closeClearModal);
}

if (modal) {
  // close when clicking backdrop
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeClearModal();
  });
}

if (confirmClear) {
  confirmClear.addEventListener("click", () => {
    const token = adminInput ? adminInput.value.trim() : "";
    if (!token) {
      if (errorText) {
        errorText.textContent = "Admin token is required.";
        errorText.classList.remove("hidden");
      }
      return;
    }
    confirmClear.disabled = true;
    confirmClear.classList.add("opacity-50", "cursor-not-allowed");
    socket.emit("clear-room", { room: currentRoom, token }, (res) => {
      confirmClear.disabled = false;
      confirmClear.classList.remove("opacity-50", "cursor-not-allowed");
      if (!res || !res.ok) {
        if (errorText) {
          errorText.textContent = (res && res.error) || "Failed to clear room.";
          errorText.classList.remove("hidden");
        }
        return;
      }
      try { localStorage.setItem("ADMIN_TOKEN", token); } catch {}
      verifyAdminToken(token);
      closeClearModal();
    });
  });
}

// Verify admin without clearing
if (verifyBtn) {
  verifyBtn.addEventListener("click", () => {
    const token = adminInput ? adminInput.value.trim() : "";
    if (!token) {
      if (errorText) {
        errorText.textContent = "Admin token is required.";
        errorText.classList.remove("hidden");
      }
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.classList.add("opacity-50", "cursor-not-allowed");
    socket.emit("verify-admin", { token }, (res) => {
      verifyBtn.disabled = false;
      verifyBtn.classList.remove("opacity-50", "cursor-not-allowed");
      if (!res || !res.ok) {
        if (errorText) {
          errorText.textContent = "Invalid token.";
          errorText.classList.remove("hidden");
        }
        return;
      }
      try { localStorage.setItem("ADMIN_TOKEN", token); } catch {}
      isAdmin = true;
      showClearButton();
      closeClearModal();
    });
  });
}

// Removed keyboard shortcut to avoid conflicts with browser/system shortcuts

// Username save wiring
if (saveUsernameBtn) {
  saveUsernameBtn.addEventListener("click", () => {
    const name = usernameInput ? usernameInput.value.trim() : "";
    if (!name) {
      if (usernameError) {
        usernameError.textContent = "Name cannot be empty.";
        usernameError.classList.remove("hidden");
      }
      return;
    }
    if (usernameError) {
      usernameError.textContent = "";
      usernameError.classList.add("hidden");
    }
    emitSetUsername(name, (res) => {
      if (!res || !res.ok) {
        if (usernameError) {
          usernameError.textContent = (res && res.error) || "Failed to set name.";
          usernameError.classList.remove("hidden");
        }
        return;
      }
      try { localStorage.setItem("CUSTOM_USERNAME", name); } catch {}
      updateUsername(res.username);
    });
  });
}

function emitSetUsername(name, cb) {
  socket.emit("set-username", { username: name }, (res) => {
    if (typeof cb === "function") cb(res);
  });
}

function verifyAdminFromStorage() {
  try {
    const token = localStorage.getItem("ADMIN_TOKEN");
    if (!token) return;
    verifyAdminToken(token);
  } catch {}
}

function verifyAdminToken(token) {
  socket.emit("verify-admin", { token }, (res) => {
    if (res && res.ok) {
      isAdmin = true;
      showClearButton();
    }
  });
}

function showClearButton() {
  if (clearBtn) clearBtn.classList.remove("hidden");
}
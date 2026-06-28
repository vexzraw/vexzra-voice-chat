// Configuración inicial
const socket = io('https://vexzra-voice-chat.onrender.com'); // Reemplazar con URL de Render al desplegar
let localStream;
let isMicActive = false;
let myUsername = localStorage.getItem('vexzra_username') || '';
let peers = {}; 
let recordedChunks = [];
let mediaRecorder;
const MAX_USERS = 5;

// Atajo de teclado 'A' doble click
let lastAPressTime = 0;
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'a') {
        const currentTime = new Date().getTime();
        if (currentTime - lastAPressTime < 400) { // 400ms para doble pulsación
            toggleMic();
            lastAPressTime = 0; // Reset
        } else {
            lastAPressTime = currentTime;
        }
    }
});

// Cerrar modales clickeando fuera
document.addEventListener('click', (e) => {
    const welcome = document.getElementById('welcome-modal');
    if (!welcome.classList.contains('hidden') && !welcome.contains(e.target) && e.target.tagName !== 'BUTTON') {
        closeModal('welcome-modal');
        checkUsername();
    }
});

window.onload = () => {
    if(!myUsername) {
        document.getElementById('welcome-modal').classList.remove('hidden');
    } else {
        document.getElementById('welcome-modal').classList.add('hidden');
        showMainApp();
    }
};

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if(id === 'welcome-modal') checkUsername();
}

function checkUsername() {
    if (!myUsername) {
        document.getElementById('username-modal').classList.remove('hidden');
    } else {
        showMainApp();
    }
}

function saveUsername() {
    const input = document.getElementById('username-input').value.trim();
    if (input) {
        myUsername = input;
        localStorage.setItem('vexzra_username', myUsername);
        document.getElementById('username-modal').classList.add('hidden');
        showMainApp();
    }
}

async function requestMic() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Desactivar audio por defecto (Push to talk)
        localStream.getAudioTracks()[0].enabled = false; 
        closeModal('welcome-modal');
    } catch (err) {
        alert('Se necesita el micrófono para el Walkie Talkie.');
    }
}

function showMainApp() {
    document.getElementById('main-app').classList.remove('hidden');
    if(!localStream) requestMic().then(() => joinRoom('general'));
    else joinRoom('general');
}

function toggleMic() {
    if (!localStream) return;
    isMicActive = !isMicActive;
    localStream.getAudioTracks()[0].enabled = isMicActive;
    
    const btn = document.getElementById('mic-btn');
    if (isMicActive) {
        btn.classList.add('active');
        btn.innerHTML = '🔴 Transmitiendo...';
        socket.emit('speaking', { user: myUsername, status: true });
        simulateSpeakingUI(myUsername, true);
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '🎤 Hablar (Push to Talk)';
        socket.emit('speaking', { user: myUsername, status: false });
        simulateSpeakingUI(myUsername, false);
    }
}

// Interfaz Gráfica: Hablando
function simulateSpeakingUI(username, isSpeaking) {
    const wrapper = document.getElementById(`avatar-wrapper-${username}`);
    const area = document.querySelector('.chat-area');
    
    if (wrapper) {
        if (isSpeaking) {
            wrapper.classList.add('speaking');
            area.classList.add('someone-speaking');
        } else {
            wrapper.classList.remove('speaking');
            if(document.querySelectorAll('.avatar-wrapper.speaking').length === 0) {
                area.classList.remove('someone-speaking');
            }
        }
    }
}

socket.on('user_speaking', (data) => {
    simulateSpeakingUI(data.user, data.status);
});

// Lógica de Renderizado de Avatares en Círculo
function renderAvatars(users) {
    const container = document.getElementById('avatar-circle');
    container.innerHTML = ''; // Clear
    
    const radius = 120; // Radio del círculo
    const step = (2 * Math.PI) / users.length;
    
    users.forEach((user, index) => {
        const angle = index * step - Math.PI / 2;
        const x = Math.round(radius * Math.cos(angle));
        const y = Math.round(radius * Math.sin(angle));
        
        const wrapper = document.createElement('div');
        wrapper.className = 'avatar-wrapper';
        wrapper.id = `avatar-wrapper-${user.name}`;
        wrapper.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        
        wrapper.innerHTML = `
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=${user.name}" class="avatar" alt="${user.name}">
            <div class="username-label">${user.name}</div>
            <input type="range" class="vol-slider" min="0" max="1" step="0.1" value="1" onchange="changeVolume('${user.name}', this.value)">
        `;
        container.appendChild(wrapper);
    });
}

function changeVolume(username, value) {
    // Aquí se conectaría la lógica del Web Audio API o HTMLAudioElement
    // Ej: audioElements[username].volume = value;
    console.log(`Volumen de ${username} ajustado a ${value}`);
}

// Grabación de Llamada Local
function toggleRecording() {
    const btn = document.getElementById('record-btn');
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        btn.innerHTML = '🔴 Grabar Llamada';
        btn.classList.remove('active');
    } else {
        if (!localStream) return alert('No hay stream de audio activo.');
        
        // NOTA: Para un MVP, graba solo el micrófono local.
        // Mezclar audio remoto requiere Web Audio API (MediaStreamDestination).
        mediaRecorder = new MediaRecorder(localStream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `vexzra-record-${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            recordedChunks = [];
        };
        mediaRecorder.start();
        btn.innerHTML = '⏹️ Detener Grabación';
        btn.classList.add('active');
    }
}

// Websockets Dummy Data para Visualización (WebRTC requiere ICE Servers en prod)
function joinRoom(roomName) {
    socket.emit('join', { username: myUsername, room: roomName });
}

socket.on('room_users', (users) => {
    // Si hay más de 5, idealmente se bloquea en backend
    renderAvatars(users.slice(0, MAX_USERS));
});

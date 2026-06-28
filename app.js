// Configuración inicial
const socket = io('https://vexzra-voice-chat.onrender.com'); // Reemplazar si procede
let localStream;
let isMicActive = false;
let myUsername = localStorage.getItem('vexzra_username') || '';
let peers = {}; // { [peerId]: { pc, audioEl, name } }
let mySocketId = null;
let recordedChunks = [];
let mediaRecorder;
const MAX_USERS = 5;

socket.on('connect', () => {
    mySocketId = socket.id;
    console.log('Connected to signaling server, id=', mySocketId);
});


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

// Cuando recibimos la lista de usuarios, renderizamos y creamos conexiones si corresponde
socket.on('room_users', (users) => {
    renderAvatars(users.slice(0, MAX_USERS));
    ensurePeerConnections(users);
});

// Cuando un usuario nuevo entra, los miembros existentes deberían iniciar una oferta hacia él
socket.on('new_user', (user) => {
    // Si yo ya tengo una conexión con él, ignorar
    if (user.id === mySocketId) return;
    if (!peers[user.id]) {
        // Soy miembro existente => inicio la offer al nuevo usuario
        createPeerConnection(user.id, user.name, true);
    }
});

// Señalización entrante: OFFER
socket.on('offer', async (data) => {
    const fromId = data.from;
    const offer = data.offer;
    if (!peers[fromId]) {
        createPeerConnection(fromId, data.name || 'remote', false);
    }
    const pc = peers[fromId].pc;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: fromId, answer: pc.localDescription });
    } catch (err) {
        console.error('Error handling offer', err);
    }
});

// Señalización entrante: ANSWER
socket.on('answer', async (data) => {
    const fromId = data.from;
    const answer = data.answer;
    const pc = peers[fromId] && peers[fromId].pc;
    if (!pc) return;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error applying answer', err);
    }
});

// Señalización entrante: ICE candidate
socket.on('ice_candidate', async (data) => {
    const fromId = data.from;
    const candidate = data.candidate;
    const pc = peers[fromId] && peers[fromId].pc;
    if (!pc) return;
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.warn('Error adding received ICE candidate', err);
    }
});

function ensurePeerConnections(users) {
    users.forEach((user) => {
        if (user.id === mySocketId) return;
        if (!peers[user.id]) {
            // Decide who inicia: hacemos que los que ya estaban inicien ofertando al que se une
            // Si quieres otra lógica, puedes usar timestamps. Aquí, si mi id < user.id, no iniciar (determinístico).
            // Para simplicidad: no iniciar aquí; espera 'new_user' o que otro inicie.
        }
    });
}

function createPeerConnection(peerId, peerName, isInitiator) {
    if (!localStream) {
        console.warn('Local stream not ready yet');
        return;
    }
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    const remoteStream = new MediaStream();

    // Crear <audio> para reproducir el stream remoto
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    audio.dataset.peer = peerId;
    audio.style.display = 'none'; // puedes insertarlo en avatar-wrapper si quieres controles UI
    document.body.appendChild(audio);

    pc.ontrack = (event) => {
        // event.streams[0] suele existir y es más fiable
        const stream = event.streams && event.streams[0] ? event.streams[0] : null;
        if (stream) {
            audio.srcObject = stream;
        } else {
            // fallback: añadir pistas manualmente
            event.track && remoteStream.addTrack(event.track);
            audio.srcObject = remoteStream;
        }
    };

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice_candidate', { to: peerId, candidate: e.candidate });
        }
    };

    // Añadir pistas locales (aunque deshabilitadas por defecto para push-to-talk)
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    peers[peerId] = { pc, audioEl: audio, name: peerName };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).then(() => {
            socket.emit('offer', { to: peerId, offer: pc.localDescription });
        }).catch(err => console.error('Error creating offer', err));
    }
}

// Helper para cerrar y limpiar peer
function closePeer(peerId) {
    const p = peers[peerId];
    if (!p) return;
    try {
        p.pc.close();
    } catch (e) {}
    if (p.audioEl && p.audioEl.parentNode) p.audioEl.parentNode.removeChild(p.audioEl);
    delete peers[peerId];
}

// Helper para cerrar y limpiar peer
function closePeer(peerId) {
    const p = peers[peerId];
    if (!p) return;
    try {
        p.pc.close();
    } catch (e) {}
    if (p.audioEl && p.audioEl.parentNode) p.audioEl.parentNode.removeChild(p.audioEl);
    delete peers[peerId];
}
// Websockets Dummy Data para Visualización (WebRTC requiere ICE Servers en prod)
function joinRoom(roomName) {
    socket.emit('join', { username: myUsername, room: roomName });
}

socket.on('room_users', (users) => {
    // Si hay más de 5, idealmente se bloquea en backend
    renderAvatars(users.slice(0, MAX_USERS));
});

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

// --- UI y modales (mantener tu código existente) ---
let lastAPressTime = 0;
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'a') {
        const currentTime = new Date().getTime();
        if (currentTime - lastAPressTime < 400) {
            toggleMic();
            lastAPressTime = 0;
        } else {
            lastAPressTime = currentTime;
        }
    }
});

document.addEventListener('click', (e) => {
    const welcome = document.getElementById('welcome-modal');
    if (welcome && !welcome.classList.contains('hidden') && !welcome.contains(e.target) && e.target.tagName !== 'BUTTON') {
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
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
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
        if (localStream.getAudioTracks().length) localStream.getAudioTracks()[0].enabled = false;
        closeModal('welcome-modal');
    } catch (err) {
        alert('Se necesita el micrófono para el Walkie Talkie.');
        console.error(err);
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
    const track = localStream.getAudioTracks()[0];
    if (track) track.enabled = isMicActive;
    
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

function simulateSpeakingUI(username, isSpeaking) {
    // Intenta buscar por socket-id primero, luego por nombre
    let wrapper = document.querySelector(`#avatar-wrapper-${CSS.escape(username)}`) || document.querySelector(`[data-name="${CSS.escape(username)}"]`);
    if (!wrapper) {
        // intenta por socket id en caso de que username sea socketId
        wrapper = document.querySelector(`#avatar-wrapper-${username}`);
    }
    const area = document.querySelector('.chat-area');
    
    if (wrapper) {
        if (isSpeaking) {
            wrapper.classList.add('speaking');
            area && area.classList.add('someone-speaking');
        } else {
            wrapper.classList.remove('speaking');
            if(document.querySelectorAll('.avatar-wrapper.speaking').length === 0) {
                area && area.classList.remove('someone-speaking');
            }
        }
    }
}

socket.on('user_speaking', (data) => {
    simulateSpeakingUI(data.user, data.status);
});

// --- Renderizado de avatares robusto (usa socket id para ids DOM) ---
function renderAvatars(users) {
    const container = document.getElementById('avatar-circle');
    if (!container) return;
    container.innerHTML = ''; // limpiamos y reconstruimos

    if (!users || users.length === 0) return;

    const radius = 120;
    const step = (2 * Math.PI) / users.length;

    users.forEach((user, index) => {
        const angle = index * step - Math.PI / 2;
        const x = Math.round(radius * Math.cos(angle));
        const y = Math.round(radius * Math.sin(angle));

        // Usa socket id para id del wrapper (evita espacios/char problemáticos)
        const wrapper = document.createElement('div');
        wrapper.className = 'avatar-wrapper';
        wrapper.id = `avatar-wrapper-${user.id}`;
        wrapper.dataset.userId = user.id;
        wrapper.dataset.name = user.name;
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        wrapper.style.top = '50%';
        wrapper.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

        // Imagen de avatar (escapa el seed)
        const seed = encodeURIComponent(user.name || user.id);
        const img = document.createElement('img');
        img.className = 'avatar';
        img.alt = user.name;
        img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;

        // Label con nombre
        const label = document.createElement('div');
        label.className = 'username-label';
        label.textContent = user.name === myUsername ? `${user.name} (tú)` : user.name;

        // Contenedor audio dentro del avatar
        let audio = document.querySelector(`audio[data-peer="${user.id}"]`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.playsInline = true;
            audio.controls = false;
            audio.dataset.peer = user.id;
            audio.style.width = '0';
            audio.style.height = '0';
            audio.style.opacity = '0';
            // no lo ocultamos con display:none porque algunos navegadores bloquean autoplay si no está en DOM visible
        }

        // Slider de volumen
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'vol-slider';
        slider.min = 0;
        slider.max = 1;
        slider.step = 0.05;
        slider.value = 1;
        slider.oninput = (ev) => {
            const v = parseFloat(ev.target.value);
            audio.volume = v;
        };

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        wrapper.appendChild(slider);
        wrapper.appendChild(audio);

        container.appendChild(wrapper);

        // Si ya tengo una pc para ese peer, asegúrate de vincular el audioEl
        if (peers[user.id]) {
            peers[user.id].audioEl = audio;
            // si el peer ya tiene remoteStream, re-attach:
            if (peers[user.id].remoteStream) {
                audio.srcObject = peers[user.id].remoteStream;
            }
        }
    });
}

// Cambios de volumen (API simple)
function changeVolume(usernameOrId, value) {
    // Busca audio por data-peer (id) o por nombre
    const audio = document.querySelector(`audio[data-peer="${usernameOrId}"]`) || document.querySelector(`#avatar-wrapper-${usernameOrId} audio`);
    if (audio) audio.volume = parseFloat(value);
}

// --- WebRTC: signaling handlers (offer/answer/ice) ---
socket.on('room_users', (users) => {
    // renderiza primero
    renderAvatars(users.slice(0, MAX_USERS));
    // crea conexiones si corresponde (no iniciamos automáticamente aquí)
});

socket.on('new_user', (user) => {
    // Solo los que ya estaban conectados deberían iniciar la offer hacia el nuevo
    if (!mySocketId || user.id === mySocketId) return;
    // Si ya existe peer, no crear otra
    if (peers[user.id]) return;
    // Crea una conexión y genera offer (soy "iniciador")
    createPeerConnection(user.id, user.name, true);
});

// Señalización entrante: OFFER
socket.on('offer', async (data) => {
    const fromId = data.from;
    const offer = data.offer;
    const name = data.name || 'remote';
    if (!peers[fromId]) {
        createPeerConnection(fromId, name, false);
    }
    const pc = peers[fromId] && peers[fromId].pc;
    if (!pc) return console.warn('PC no encontrado al recibir offer', fromId);
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

function createPeerConnection(peerId, peerName, isInitiator) {
    if (!localStream) {
        console.warn('Local stream not ready yet; solicitando micrófono...');
        // intenta pedir el micrófono y continuar cuando haya stream
        requestMic().then(() => createPeerConnection(peerId, peerName, isInitiator));
        return;
    }
    if (peers[peerId]) {
        console.log('Peer ya existe', peerId);
        return;
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const remoteStream = new MediaStream();

    // Busca audio dentro del avatar-wrapper si existe (renderAvatars lo crea)
    let audioEl = document.querySelector(`audio[data-peer="${peerId}"]`);
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.controls = false;
        audioEl.dataset.peer = peerId;
        document.body.appendChild(audioEl);
    }

    pc.ontrack = (event) => {
        // preferimos event.streams[0] cuando existe
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
        if (stream) {
            audioEl.srcObject = stream;
            peers[peerId].remoteStream = stream;
        } else {
            // fallback: añadir pista a remoteStream
            if (event.track) remoteStream.addTrack(event.track);
            audioEl.srcObject = remoteStream;
            peers[peerId].remoteStream = remoteStream;
        }
    };

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice_candidate', { to: peerId, candidate: e.candidate });
        }
    };

    // Añadir pistas locales
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    peers[peerId] = { pc, audioEl, name: peerName, remoteStream };

    if (isInitiator) {
        pc.createOffer().then(offer => pc.setLocalDescription(offer))
          .then(() => {
              socket.emit('offer', { to: peerId, offer: pc.localDescription, name: myUsername });
          }).catch(err => console.error('Error creating offer', err));
    }
}

function closePeer(peerId) {
    const p = peers[peerId];
    if (!p) return;
    try { p.pc.close(); } catch (e) {}
    if (p.audioEl && p.audioEl.parentNode) p.audioEl.parentNode.removeChild(p.audioEl);
    delete peers[peerId];
}

// Grabación de llamada local (mantén tu implementación)
function toggleRecording() {
    const btn = document.getElementById('record-btn');
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        btn.innerHTML = '🔴 Grabar Llamada';
        btn.classList.remove('active');
    } else {
        if (!localStream) return alert('No hay stream de audio activo.');
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

// Websockets: unirse a sala
function joinRoom(roomName) {
    socket.emit('join', { username: myUsername, room: roomName });
}

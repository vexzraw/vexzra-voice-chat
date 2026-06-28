from flask import Flask
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'frutiger_aero_secret!'
# Permitir CORS para que tu frontend en Github Pages pueda conectarse
socketio = SocketIO(app, cors_allowed_origins="*")

# Estructura básica para almacenar usuarios por sala
rooms_data = {}

@app.route('/')
def index():
    return "Vexzra Voice Chat Signaling Server Activo 🌍✨"

@socketio.on('join')
def handle_join(data):
    username = data['username']
    room = data['room']
    
    join_room(room)
    
    if room not কক্ষ in rooms_data:
        rooms_data[room] = []
        
    # Limitar a 5 personas por sala
    if len(rooms_data[room]) < 5:
        if not any(u['name'] == username for u in rooms_data[room]):
            rooms_data[room].append({'name': username, 'id': request.sid})
    else:
        emit('room_full', {'message': 'La sala está llena (Máximo 5).'})
        return

    # Enviar lista de usuarios actualizados a toda la sala
    emit('room_users', rooms_data[room], room=room)
    print(f"{username} se unió a {room}")

@socketio.on('speaking')
def handle_speaking(data):
    # Retransmite el estado de 'hablando' (brillo/zoom del avatar) a los demás
    emit('user_speaking', data, broadcast=True, include_self=False)

@socketio.on('disconnect')
def test_disconnect():
    # Remover usuario al desconectarse
    for room, users in rooms_data.items():
        rooms_data[room] = [u for u in users if u['id'] != request.sid]
        emit('room_users', rooms_data[room], room=room)

# Aquí irían los eventos WebRTC (offer, answer, ice_candidate)
# para establecer el P2P real entre los navegadores.

if __name__ == '__main__':
    # Usar eventlet o gevent en producción (Render lo hace vía gunicorn)
    socketio.run(app, host='0.0.0.0', port=5000, deb
ug=True)

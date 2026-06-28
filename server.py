import os
from flask import Flask, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'frutiger_aero_secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

rooms_data = {}

@app.route('/')
def index():
    return "Vexzra Voice Chat Signaling Server Activo 🌍✨"

@socketio.on('join')
def handle_join(data):
    username = data['username']
    room = data['room']

    join_room(room)

    if room not in rooms_data:
        rooms_data[room] = []

    if len(rooms_data[room]) < 5:
        if not any(u['name'] == username for u in rooms_data[room]):
            rooms_data[room].append({'name': username, 'id': request.sid})
    else:
        emit('room_full', {'message': 'La sala está llena (Máximo 5).'})
        return

    # Enviar lista completa y notificar al resto que hay un nuevo usuario
    emit('room_users', rooms_data[room], room=room)
    emit('new_user', {'name': username, 'id': request.sid}, room=room, include_self=False)
    print(f"{username} se unió a {room}")

# Reenvío de ofertas/respuestas/candidatos ICE entre pares
@socketio.on('offer')
def handle_offer(data):
    target_id = data.get('to')
    offer = data.get('offer')
    if target_id:
        emit('offer', {'from': request.sid, 'offer': offer}, to=target_id)

@socketio.on('answer')
def handle_answer(data):
    target_id = data.get('to')
    answer = data.get('answer')
    if target_id:
        emit('answer', {'from': request.sid, 'answer': answer}, to=target_id)

@socketio.on('ice_candidate')
def handle_ice(data):
    target_id = data.get('to')
    candidate = data.get('candidate')
    if target_id:
        emit('ice_candidate', {'from': request.sid, 'candidate': candidate}, to=target_id)

@socketio.on('speaking')
def handle_speaking(data):
    emit('user_speaking', data, broadcast=True, include_self=False)

@socketio.on('disconnect')
def test_disconnect():
    for room, users in list(rooms_data.items()):
        rooms_data[room] = [u for u in users if u['id'] != request.sid]
        emit('room_users', rooms_data[room], room=room)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port)

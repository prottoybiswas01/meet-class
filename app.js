// === DOM Elements ===
const screens = {
    landing: document.getElementById('landing-screen'),
    adminLogin: document.getElementById('admin-login-overlay'),
    waiting: document.getElementById('waiting-screen'),
    meeting: document.getElementById('meeting-screen')
};

// Landing
const inputJoinName = document.getElementById('join-name');
const btnRequestJoin = document.getElementById('btn-request-join');
const joinError = document.getElementById('join-error');
const btnShowAdminLogin = document.getElementById('btn-show-admin-login');

// Admin Login
const inputAdminId = document.getElementById('admin-id');
const inputAdminPass = document.getElementById('admin-pass');
const btnAdminLogin = document.getElementById('btn-admin-login');
const btnCancelAdmin = document.getElementById('btn-cancel-admin');
const loginError = document.getElementById('login-error');

// Admin Controls
const adminControlsHeader = document.getElementById('admin-controls-header');
const inputInviteLink = document.getElementById('invite-link');
const btnCopyLink = document.getElementById('btn-copy-link');
const adminSidebar = document.getElementById('admin-sidebar');
const requestsList = document.getElementById('requests-list');
const requestCount = document.getElementById('request-count');
const noRequests = document.getElementById('no-requests');
const btnRecord = document.getElementById('btn-record');
const recordingIndicator = document.getElementById('recording-indicator');

// Meeting Controls
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const btnToggleVideo = document.getElementById('btn-toggle-video');
const btnLeave = document.getElementById('btn-leave');

// === State ===
let isAdmin = false;
let peer = null;
let localStream = null;
let adminPeerId = null;

// Admin state
const pendingRequests = new Map(); // peerId -> { name, connection }
const activeConnections = new Map(); // peerId -> connection
const activeCalls = new Map(); // peerId -> call

// User state
let myName = "";
let adminConnection = null;

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// === Initialization ===
function init() {
    // Check if URL has a hash (invite link)
    const hash = window.location.hash.substring(1);
    if (hash) {
        adminPeerId = hash;
        // Hide admin login button if joining via link
        btnShowAdminLogin.classList.add('hidden');
    }

    setupEventListeners();
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden-section'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden-section');
    }
}

async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        console.error("Error accessing media devices.", err);
        alert("Could not access camera and microphone.");
        return false;
    }
}

// === Event Listeners ===
function setupEventListeners() {
    // Show Admin Login
    btnShowAdminLogin.addEventListener('click', () => {
        screens.adminLogin.classList.remove('hidden-section');
    });

    // Cancel Admin Login
    btnCancelAdmin.addEventListener('click', () => {
        screens.adminLogin.classList.add('hidden-section');
        loginError.classList.add('hidden');
    });

    // Admin Login Logic
    btnAdminLogin.addEventListener('click', handleAdminLogin);

    // User Join Logic
    btnRequestJoin.addEventListener('click', handleUserJoinRequest);

    // Meeting Controls
    btnToggleAudio.addEventListener('click', toggleAudio);
    btnToggleVideo.addEventListener('click', toggleVideo);
    btnLeave.addEventListener('click', leaveMeeting);

    // Admin specific controls
    btnCopyLink.addEventListener('click', () => {
        inputInviteLink.select();
        document.execCommand('copy');
        btnCopyLink.innerHTML = '<i class="fa-solid fa-check text-green-500"></i>';
        setTimeout(() => {
            btnCopyLink.innerHTML = '<i class="fa-regular fa-copy"></i>';
        }, 2000);
    });

    btnRecord.addEventListener('click', toggleRecording);
}

// === Admin Functions ===
async function handleAdminLogin() {
    const id = inputAdminId.value;
    const pass = inputAdminPass.value;

    // Hardcoded credentials as requested
    if (id === 'admin' && pass === '123456') {
        isAdmin = true;
        screens.adminLogin.classList.add('hidden-section');
        
        const mediaSuccess = await startLocalVideo();
        if(!mediaSuccess) return;

        showScreen('meeting');
        
        // Show Admin UI parts
        adminControlsHeader.classList.remove('hidden');
        adminSidebar.classList.remove('hidden');
        btnRecord.classList.remove('hidden');

        initializeAdminPeer();
    } else {
        loginError.classList.remove('hidden');
    }
}

function initializeAdminPeer() {
    // Generate a random ID for this meeting
    const roomId = 'meet-' + Math.random().toString(36).substr(2, 9);
    peer = new Peer(roomId);

    peer.on('open', (id) => {
        console.log('Admin Peer ID:', id);
        // Generate Invite Link
        const inviteUrl = `${window.location.origin}${window.location.pathname}#${id}`;
        inputInviteLink.value = inviteUrl;
    });

    // Listen for incoming data connections (Join Requests)
    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'request-join') {
                handleIncomingJoinRequest(conn.peer, data.name, conn);
            }
        });
    });

    // We also need to be ready to receive calls just in case, but usually admin initiates.
    // Actually in WebRTC, whoever initiates call sends offer. Admin will initiate call after approval.
}

function handleIncomingJoinRequest(peerId, name, conn) {
    if (pendingRequests.has(peerId)) return;

    pendingRequests.set(peerId, { name, conn });
    updateRequestsUI();
}

function updateRequestsUI() {
    requestsList.innerHTML = '';
    requestCount.innerText = pendingRequests.size;

    if (pendingRequests.size === 0) {
        noRequests.classList.remove('hidden');
        return;
    }
    
    noRequests.classList.add('hidden');

    pendingRequests.forEach((req, peerId) => {
        const div = document.createElement('div');
        div.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between';
        div.innerHTML = `
            <span class="font-medium text-sm truncate w-24" title="${req.name}">${req.name}</span>
            <div class="flex gap-2">
                <button class="bg-red-500 hover:bg-red-600 w-8 h-8 rounded text-white flex items-center justify-center transition" onclick="rejectUser('${peerId}')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button class="bg-green-500 hover:bg-green-600 w-8 h-8 rounded text-white flex items-center justify-center transition" onclick="approveUser('${peerId}')">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        `;
        requestsList.appendChild(div);
    });
}

window.approveUser = function(peerId) {
    const req = pendingRequests.get(peerId);
    if (req) {
        // Send approval message
        req.conn.send({ type: 'approved' });
        
        // Keep connection active
        activeConnections.set(peerId, req.conn);
        
        // Initiate Media Call to the user
        const call = peer.call(peerId, localStream);
        
        call.on('stream', (remoteStream) => {
            addVideoStream(peerId, remoteStream, req.name);
        });

        activeCalls.set(peerId, call);
        
        // Cleanup on disconnect
        req.conn.on('close', () => removeUser(peerId));
        call.on('close', () => removeUser(peerId));

        pendingRequests.delete(peerId);
        updateRequestsUI();
    }
};

window.rejectUser = function(peerId) {
    const req = pendingRequests.get(peerId);
    if (req) {
        req.conn.send({ type: 'rejected' });
        setTimeout(() => req.conn.close(), 500);
        pendingRequests.delete(peerId);
        updateRequestsUI();
    }
};

// === User Functions ===
async function handleUserJoinRequest() {
    myName = inputJoinName.value.trim();
    if (!myName) {
        joinError.innerText = "Please enter your name.";
        joinError.classList.remove('hidden');
        return;
    }
    if (!adminPeerId) {
        joinError.innerText = "No meeting ID found in link.";
        joinError.classList.remove('hidden');
        return;
    }

    const mediaSuccess = await startLocalVideo();
    if(!mediaSuccess) return;

    // Show waiting screen
    showScreen('waiting');

    // Initialize User Peer
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('My User Peer ID:', id);
        // Connect to Admin
        adminConnection = peer.connect(adminPeerId);

        adminConnection.on('open', () => {
            // Send join request
            adminConnection.send({ type: 'request-join', name: myName });
        });

        adminConnection.on('data', (data) => {
            if (data.type === 'approved') {
                // Admin approved! Wait for call.
                console.log("Approved! Waiting for call...");
            } else if (data.type === 'rejected') {
                alert("Your request to join was rejected by the admin.");
                showScreen('landing');
            }
        });

        adminConnection.on('close', () => {
            alert("Connection to meeting host lost.");
            leaveMeeting();
        });
    });

    // Listen for Admin calling us
    peer.on('call', (call) => {
        console.log("Receiving call from Admin...");
        // Answer call with our stream
        call.answer(localStream);
        
        showScreen('meeting');
        
        call.on('stream', (remoteStream) => {
            addVideoStream('admin', remoteStream, 'Host');
        });

        call.on('close', () => {
            alert("Meeting ended by host.");
            leaveMeeting();
        });
    });
}

// === Shared Video & Controls Functions ===
function addVideoStream(id, stream, name) {
    // Check if already exists
    if (document.getElementById(`video-container-${id}`)) return;

    const container = document.createElement('div');
    container.id = `video-container-${id}`;
    container.className = 'video-container shadow-lg';

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'name-label';
    label.innerText = name;

    container.appendChild(video);
    container.appendChild(label);
    videoGrid.appendChild(container);
}

function removeUser(id) {
    const el = document.getElementById(`video-container-${id}`);
    if (el) el.remove();
    activeConnections.delete(id);
    activeCalls.delete(id);
}

function toggleAudio() {
    if(!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        btnToggleAudio.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        btnToggleAudio.classList.replace('bg-gray-700', 'bg-red-600');
    } else {
        audioTrack.enabled = true;
        btnToggleAudio.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        btnToggleAudio.classList.replace('bg-red-600', 'bg-gray-700');
    }
}

function toggleVideo() {
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
        btnToggleVideo.classList.replace('bg-gray-700', 'bg-red-600');
    } else {
        videoTrack.enabled = true;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
        btnToggleVideo.classList.replace('bg-red-600', 'bg-gray-700');
    }
}

function leaveMeeting() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }
    if (peer) {
        peer.destroy();
    }
    window.location.reload();
}

// === Recording Functionality ===
async function toggleRecording() {
    if (!isAdmin) return;

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        // Request the user to select the screen to share (usually the current tab for meeting recording)
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { cursor: "always" }, 
            audio: true 
        });

        // Try to include microphone audio in the recording
        let tracks = [...displayStream.getTracks()];
        if (localStream) {
            const audioTracks = localStream.getAudioTracks();
            if(audioTracks.length > 0) {
                tracks.push(audioTracks[0]);
            }
        }
        
        const combinedStream = new MediaStream(tracks);
        
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = function() {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            recordedChunks = [];
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const filename = `meeting-record-${new Date().getTime()}.webm`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
            
            isRecording = false;
            btnRecord.classList.remove('text-red-500');
            btnRecord.classList.add('text-gray-300');
            recordingIndicator.classList.add('hidden');
        };
        
        mediaRecorder.start();
        isRecording = true;
        btnRecord.classList.remove('text-gray-300');
        btnRecord.classList.add('text-red-500');
        recordingIndicator.classList.remove('hidden');
        
        // Listen for native "Stop sharing" button click in browser
        displayStream.getVideoTracks()[0].onended = () => {
            if(isRecording) stopRecording();
        };

    } catch (err) {
        console.error("Error starting recording:", err);
        alert("Could not start recording. Permission denied.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        // Stop the display tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// Start app
init();

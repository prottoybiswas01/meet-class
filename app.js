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
const permissionModal = document.getElementById('permission-modal');
const btnClosePermission = document.getElementById('btn-close-permission');

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
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const mobileRequestBadge = document.getElementById('mobile-request-badge');
const requestsList = document.getElementById('requests-list');
const requestCount = document.getElementById('request-count');
const noRequests = document.getElementById('no-requests');
const btnRecord = document.getElementById('btn-record');
const btnScreenShare = document.getElementById('btn-screen-share');
const recordingIndicator = document.getElementById('recording-indicator');

// Meeting Controls
const videoAreaGrid = document.getElementById('video-grid');
const focusContainer = document.getElementById('focus-container');
const focusVideo = document.getElementById('focus-video');
const focusName = document.getElementById('focus-name');
const localVideo = document.getElementById('local-video');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const btnToggleVideo = document.getElementById('btn-toggle-video');
const btnLeave = document.getElementById('btn-leave');

// === State ===
let isAdmin = false;
let peer = null;
let localStream = null;
let adminPeerId = null;
let myName = "";

// Full Mesh state
// peerId -> { name, connection, call, stream }
const peersData = new Map(); 
const pendingRequests = new Map(); // Admin only

// Recording & Screen Share state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isScreenSharing = false;
let screenStream = null;

let audioContext;
let audioDestination;

// === Initialization ===
function init() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        adminPeerId = hash;
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
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
            permissionModal.classList.remove('hidden-section');
        } else {
            alert("Could not access camera and microphone.");
        }
        return false;
    }
}

// === Event Listeners ===
function setupEventListeners() {
    btnShowAdminLogin.addEventListener('click', () => screens.adminLogin.classList.remove('hidden-section'));
    btnCancelAdmin.addEventListener('click', () => {
        screens.adminLogin.classList.add('hidden-section');
        loginError.classList.add('hidden');
    });
    btnAdminLogin.addEventListener('click', handleAdminLogin);
    btnRequestJoin.addEventListener('click', handleUserJoinRequest);
    btnToggleAudio.addEventListener('click', toggleAudio);
    btnToggleVideo.addEventListener('click', toggleVideo);
    btnLeave.addEventListener('click', leaveMeeting);
    
    if (btnClosePermission) {
        btnClosePermission.addEventListener('click', () => {
            permissionModal.classList.add('hidden-section');
        });
    }

    btnCopyLink.addEventListener('click', () => {
        inputInviteLink.select();
        document.execCommand('copy');
        btnCopyLink.innerHTML = '<i class="fa-solid fa-check text-green-500"></i>';
        setTimeout(() => btnCopyLink.innerHTML = '<i class="fa-regular fa-copy"></i>', 2000);
    });

    btnRecord.addEventListener('click', toggleRecording);
    btnScreenShare.addEventListener('click', toggleScreenShare);

    // Mobile Sidebar Toggles
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            adminSidebar.classList.remove('translate-x-full');
            sidebarBackdrop.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            sidebarBackdrop.classList.add('opacity-100', 'pointer-events-auto');
        });
    }
    if (btnCloseSidebar) {
        btnCloseSidebar.addEventListener('click', closeMobileSidebar);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }
}

function closeMobileSidebar() {
    adminSidebar.classList.add('translate-x-full');
    sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    sidebarBackdrop.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        if (sidebarBackdrop.classList.contains('opacity-0')) {
            sidebarBackdrop.classList.add('hidden');
        }
    }, 300);
}

// === Admin Functions ===
async function handleAdminLogin() {
    const id = inputAdminId.value;
    const pass = inputAdminPass.value;

    if (id === 'admin' && pass === '123456') {
        isAdmin = true;
        myName = "Host";
        screens.adminLogin.classList.add('hidden-section');
        
        const mediaSuccess = await startLocalVideo();
        if(!mediaSuccess) return;

        showScreen('meeting');
        adminControlsHeader.classList.remove('hidden');
        adminSidebar.classList.remove('hidden');
        if (btnToggleSidebar) btnToggleSidebar.classList.remove('hidden', 'md:hidden');
        btnRecord.classList.remove('hidden');

        initializePeer();
    } else {
        loginError.classList.remove('hidden');
    }
}

// === User Functions ===
async function handleUserJoinRequest() {
    myName = inputJoinName.value.trim();
    if (!myName) return joinError.classList.remove('hidden');
    if (!adminPeerId) {
        joinError.innerText = "No meeting ID found in link.";
        return joinError.classList.remove('hidden');
    }

    const mediaSuccess = await startLocalVideo();
    if(!mediaSuccess) return;

    showScreen('waiting');
    initializePeer();
}

// === Peer Initialization (Mesh) ===
const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    }
};

function initializePeer() {
    const peerId = isAdmin ? ('meet-' + Math.random().toString(36).substr(2, 9)) : undefined;
    peer = new Peer(peerId, peerConfig);

    peer.on('open', (id) => {
        console.log('My Peer ID:', id);
        
        if (isAdmin) {
            inputInviteLink.value = `${window.location.origin}${window.location.pathname}#${id}`;
        } else {
            // User joins Admin
            const conn = peer.connect(adminPeerId, {metadata: {name: myName}});
            peersData.set(adminPeerId, {name: "Host", connection: conn});
            
            conn.on('open', () => conn.send({ type: 'request-join', name: myName }));
            setupConnectionListeners(conn);
        }
    });

    peer.on('connection', (conn) => {
        // Handle incoming data connections
        const remoteName = conn.metadata ? conn.metadata.name : "User";
        
        if (isAdmin && !peersData.has(conn.peer)) {
            // New join request
            pendingRequests.set(conn.peer, {name: remoteName, conn});
            updateRequestsUI();
            
            // If they close the tab while waiting
            conn.on('close', () => {
                pendingRequests.delete(conn.peer);
                updateRequestsUI();
            });
        } else {
            // Full Mesh: peer connecting directly
            if (!peersData.has(conn.peer)) {
                peersData.set(conn.peer, {name: remoteName, connection: conn});
            } else {
                peersData.get(conn.peer).connection = conn;
            }
            setupConnectionListeners(conn);
        }
    });

    peer.on('call', (call) => {
        // Handle incoming media calls
        call.answer(localStream);
        
        // --- BULLETPROOF APPROVAL FALLBACK ---
        // If the data channel dropped the 'approved' message, the media call metadata will still deliver it!
        if (call.metadata && call.metadata.type === 'approved' && !isAdmin) {
            handleApproved(call.metadata.peers);
        }

        const remoteName = call.metadata ? call.metadata.name : "User";
        
        if (!peersData.has(call.peer)) {
            peersData.set(call.peer, {name: remoteName});
        }
        setupCallListeners(call, remoteName);
    });
}

function setupConnectionListeners(conn) {
    conn.on('data', data => {
        if (data.type === 'request-join' && isAdmin) {
            if (!peersData.has(conn.peer)) {
                pendingRequests.set(conn.peer, {name: data.name, conn});
                updateRequestsUI();
            }
        } else if (data.type === 'approved' && !isAdmin) {
            handleApproved(data.peers);
        } else if (data.type === 'rejected' && !isAdmin) {
            alert("Your request to join was rejected by the admin.");
            window.location.reload();
        } else if (data.type === 'new-peer') {
            // Just register their info, wait for them to connect
            if (!peersData.has(data.id)) peersData.set(data.id, {name: data.name});
        } else if (data.type === 'screen-share-start') {
            handleScreenShareStart(conn.peer);
        } else if (data.type === 'screen-share-stop') {
            handleScreenShareStop(conn.peer);
        }
    });

    conn.on('close', () => removeUser(conn.peer));
}

function setupCallListeners(call, name) {
    let pData = peersData.get(call.peer);
    if (!pData) {
        pData = {name: name};
        peersData.set(call.peer, pData);
    }
    pData.call = call;

    call.on('stream', stream => {
        // Check if stream is already handled
        if (pData.stream && pData.stream.id === stream.id) return;
        
        pData.stream = stream;
        addVideoStream(call.peer, stream, name);
        
        // If recording is active, plug this new stream into the mix
        if (isRecording && audioContext && audioDestination && stream.getAudioTracks().length > 0) {
            const remoteSource = audioContext.createMediaStreamSource(stream);
            remoteSource.connect(audioDestination);
        }
    });
    call.on('close', () => removeUser(call.peer));
}

// === Admin Approval Flow ===
function updateRequestsUI() {
    requestsList.innerHTML = '';
    requestCount.innerText = pendingRequests.size;
    noRequests.classList.toggle('hidden', pendingRequests.size > 0);
    
    // Update mobile badge
    if (mobileRequestBadge) {
        mobileRequestBadge.innerText = pendingRequests.size;
        if (pendingRequests.size > 0) {
            mobileRequestBadge.classList.remove('hidden');
            if (btnToggleSidebar) btnToggleSidebar.classList.add('animate-bounce');
            setTimeout(() => { if(btnToggleSidebar) btnToggleSidebar.classList.remove('animate-bounce'); }, 3000);
        } else {
            mobileRequestBadge.classList.add('hidden');
        }
    }

    pendingRequests.forEach((req, peerId) => {
        const div = document.createElement('div');
        div.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between';
        div.innerHTML = `
            <span class="font-medium text-sm truncate w-24" title="${req.name}">${req.name}</span>
            <div class="flex gap-2">
                <button class="bg-red-500 hover:bg-red-600 w-8 h-8 rounded text-white flex items-center justify-center" onclick="rejectUser('${peerId}')"><i class="fa-solid fa-xmark"></i></button>
                <button class="bg-green-500 hover:bg-green-600 w-8 h-8 rounded text-white flex items-center justify-center" onclick="approveUser('${peerId}')"><i class="fa-solid fa-check"></i></button>
            </div>
        `;
        requestsList.appendChild(div);
    });
}

window.approveUser = function(peerId) {
    const req = pendingRequests.get(peerId);
    if (!req) return;

    // Send active peer list to new user
    const currentPeers = [];
    peersData.forEach((d, id) => {
        if (d.connection && id !== adminPeerId && id !== peerId) currentPeers.push({id, name: d.name});
    });

    req.conn.send({ type: 'approved', peers: currentPeers });
    
    // Attach connection listeners now that they are approved
    setupConnectionListeners(req.conn);
    peersData.set(peerId, {name: req.name, connection: req.conn});
    
    // Broadcast new user to existing peers
    peersData.forEach((d, id) => {
        if (d.connection && id !== peerId && id !== adminPeerId) {
            d.connection.send({ type: 'new-peer', id: peerId, name: req.name });
        }
    });

    pendingRequests.delete(peerId);
    updateRequestsUI();

    // Admin initiates Media Call to the new user directly for highest reliability.
    // We pass the approval info in the metadata as a bulletproof fallback in case the Data Channel drops the message.
    setTimeout(() => {
        const call = peer.call(peerId, localStream, {
            metadata: {
                name: myName,
                type: 'approved',
                peers: currentPeers
            }
        });
        setupCallListeners(call, req.name);
    }, 500);
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

// === User Approved Flow ===
let isApproved = false;

function handleApproved(roomPeers) {
    if (isApproved) return;
    isApproved = true;
    
    showScreen('meeting');
    
    // Admin will call us, so we just wait for Admin's call.
    // However, we need to call other existing peers in the room.
    roomPeers.forEach(p => {
        // Connect Data
        const conn = peer.connect(p.id, {metadata: {name: myName}});
        let pData = peersData.get(p.id);
        if (!pData) {
            pData = {name: p.name};
            peersData.set(p.id, pData);
        }
        pData.connection = conn;
        setupConnectionListeners(conn);
        
        // Connect Media
        setTimeout(() => {
            const call = peer.call(p.id, localStream, {metadata: {name: myName}});
            setupCallListeners(call, p.name);
        }, 500);
    });
}

// === Shared Video & Controls Functions ===
function addVideoStream(id, stream, name) {
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
    videoAreaGrid.appendChild(container);
}

function removeUser(id) {
    const el = document.getElementById(`video-container-${id}`);
    if (el) el.remove();
    peersData.delete(id);
    
    if (id === adminPeerId && !isAdmin) {
        alert("Meeting ended by host.");
        window.location.reload();
    }
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
        localVideo.style.opacity = '0.3';
    } else {
        videoTrack.enabled = true;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
        btnToggleVideo.classList.replace('bg-red-600', 'bg-gray-700');
        localVideo.style.opacity = '1';
    }
}

// === Screen Share Flow & Layout ===
async function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace track for all active calls
            peersData.forEach(p => {
                if (p.call) {
                    const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }
            });

            isScreenSharing = true;
            btnScreenShare.classList.replace('text-gray-300', 'text-blue-500');

            // Broadcast
            peersData.forEach(p => {
                if (p.connection) p.connection.send({type: 'screen-share-start'});
            });

            // Local layout update
            focusVideo.srcObject = screenStream;
            focusName.innerText = "You (Screen)";
            focusContainer.classList.remove('hidden');
            videoAreaGrid.classList.remove('video-grid', 'overflow-y-auto');
            videoAreaGrid.classList.add('grid-focus-sidebar');

            screenTrack.onended = () => { if (isScreenSharing) stopScreenShare(); };
        } catch (err) {
            console.error("Error sharing screen:", err);
            
            // Handle mobile/unsupported browser errors gracefully
            if (err.name === "NotSupportedError" || err.message.includes("supported") || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                alert("দুঃখিত, মোবাইল ব্রাউজার থেকে সরাসরি স্ক্রিন শেয়ার করা সম্ভব নয়। স্ক্রিন শেয়ারিং শুধুমাত্র কম্পিউটার বা ল্যাপটপ থেকে কাজ করে।");
            } else {
                alert("Could not start screen sharing. Permission denied or not supported.");
            }
        }
    }
}

function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    isScreenSharing = false;
    btnScreenShare.classList.replace('text-blue-500', 'text-gray-300');

    // Revert track for all calls
    const cameraTrack = localStream.getVideoTracks()[0];
    peersData.forEach(p => {
        if (p.call) {
            const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(cameraTrack);
        }
        if (p.connection) p.connection.send({type: 'screen-share-stop'});
    });

    // Local layout update
    focusContainer.classList.add('hidden');
    focusVideo.srcObject = null;
    videoAreaGrid.classList.remove('grid-focus-sidebar');
    videoAreaGrid.classList.add('video-grid', 'overflow-y-auto');
}

function handleScreenShareStart(peerId) {
    const peerData = peersData.get(peerId);
    if (!peerData || !peerData.stream) return;
    
    focusVideo.srcObject = peerData.stream;
    focusName.innerText = peerData.name + " (Screen)";
    
    focusContainer.classList.remove('hidden');
    videoAreaGrid.classList.remove('video-grid', 'overflow-y-auto');
    videoAreaGrid.classList.add('grid-focus-sidebar');
}

function handleScreenShareStop(peerId) {
    focusContainer.classList.add('hidden');
    focusVideo.srcObject = null;
    
    videoAreaGrid.classList.remove('grid-focus-sidebar');
    videoAreaGrid.classList.add('video-grid', 'overflow-y-auto');
}

function leaveMeeting() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peer) peer.destroy();
    window.location.reload();
}

// === Recording Functionality (With Audio Mixing) ===
async function toggleRecording() {
    if (!isAdmin) return;

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

let reusedScreenShare = false;
let recordingVideoStream = null;

async function startRecording() {
    try {
        if (isScreenSharing && screenStream) {
            // Reuse the existing screen share stream to prevent freezing (browser bug with multiple captures)
            recordingVideoStream = screenStream;
            reusedScreenShare = true;
        } else {
            // Request the user to select the screen to share
            recordingVideoStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { cursor: "always" }, 
                audio: true // Attempt to get system audio if possible
            });
            reusedScreenShare = false;
        }

        // Initialize AudioContext to mix all voices
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioContext.createMediaStreamDestination();

        // 1. Add Local Mic
        if (localStream && localStream.getAudioTracks().length > 0) {
            const localSource = audioContext.createMediaStreamSource(localStream);
            localSource.connect(audioDestination);
        }

        // 2. Add All Remote Peers
        peersData.forEach(p => {
            if (p.stream && p.stream.getAudioTracks().length > 0) {
                const remoteSource = audioContext.createMediaStreamSource(p.stream);
                remoteSource.connect(audioDestination);
            }
        });

        // 3. Add Screen System Audio (if any and not reusing)
        if (!reusedScreenShare && recordingVideoStream.getAudioTracks().length > 0) {
            const displaySource = audioContext.createMediaStreamSource(recordingVideoStream);
            displaySource.connect(audioDestination);
        }

        // Combine the Screen Video Track with the Mixed Audio Track
        const combinedStream = new MediaStream([
            recordingVideoStream.getVideoTracks()[0],
            audioDestination.stream.getAudioTracks()[0]
        ]);
        
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = function() {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            recordedChunks = [];
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `meeting-record-${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
            
            isRecording = false;
            btnRecord.classList.replace('text-red-500', 'text-gray-300');
            recordingIndicator.classList.add('hidden');
            
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
        };
        
        mediaRecorder.start();
        isRecording = true;
        btnRecord.classList.replace('text-gray-300', 'text-red-500');
        recordingIndicator.classList.remove('hidden');
        
        if (!reusedScreenShare) {
            recordingVideoStream.getVideoTracks()[0].onended = () => {
                if(isRecording) stopRecording();
            };
        }

    } catch (err) {
        console.error("Error starting recording:", err);
        alert("Could not start recording. Permission denied.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Always stop the mixed audio track
        mediaRecorder.stream.getAudioTracks().forEach(track => track.stop());
        
        // Only stop the video track if we didn't reuse it from screen share
        if (!reusedScreenShare && recordingVideoStream) {
            recordingVideoStream.getVideoTracks().forEach(track => track.stop());
        }
    }
}

// Start app
init();

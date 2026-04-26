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

// Preview Section
const previewSection = document.getElementById('preview-section');
const previewVideo = document.getElementById('preview-video');
const btnPreviewAudio = document.getElementById('btn-preview-audio');
const btnPreviewVideo = document.getElementById('btn-preview-video');

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
let currentSharer = null;

let audioContext;
let audioDestination;

// === Initialization ===
function init() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        adminPeerId = hash;
        btnShowAdminLogin.classList.add('hidden');
        
        // Show preview and start camera immediately for privacy check before joining
        if (previewSection) {
            previewSection.classList.remove('hidden');
            startLocalVideo();
        }
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
    if (localStream) return true; // Already started via preview
    
    try {
        // Optimize for global/weak networks: Limit resolution to 480p and enable audio optimizations
        const constraints = {
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 24, max: 30 }
            },
            audio: true // Simplified to avoid device-specific audio constraint failures
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        if (previewVideo) previewVideo.srcObject = localStream;
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

function getActiveStream() {
    if (isScreenSharing && screenStream) {
        // Return a combined stream: Screen Video + Local Audio
        const tracks = [screenStream.getVideoTracks()[0]];
        if (localStream && localStream.getAudioTracks().length > 0) {
            tracks.push(localStream.getAudioTracks()[0]);
        }
        return new MediaStream(tracks);
    }
    return localStream;
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
    
    // Preview Buttons
    if (btnPreviewAudio) btnPreviewAudio.addEventListener('click', toggleAudio);
    if (btnPreviewVideo) btnPreviewVideo.addEventListener('click', toggleVideo);
    
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

        await initializePeer();
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
    await initializePeer();
}

// === Peer Initialization (Mesh) ===
const twilioAccountSid = 'AC09ee27b48b02b73be35c8f97bb92af04';
const twilioAuthToken = 'e521bb75c3c60565048b47b96fe884fb';

async function getTwilioIceServers() {
    try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Tokens.json`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(twilioAccountSid + ':' + twilioAuthToken)
            }
        });
        const data = await response.json();
        return data.ice_servers;
    } catch (err) {
        console.error("Twilio error:", err);
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ];
    }
}

async function initializePeer() {
    const iceServers = await getTwilioIceServers();
    
    const peerConfig = {
        config: {
            'iceServers': iceServers
        }
    };

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

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'peer-unavailable') {
            alert("মিটিংটি শেষ হয়ে গেছে অথবা অ্যাডমিন এই মুহূর্তে অফলাইনে আছেন। (Admin is offline)");
            window.location.reload();
        } else if (err.type === 'network' || err.type === 'disconnected') {
            console.warn("Network issue detected.");
        }
    });

    peer.on('call', (call) => {
        // --- BULLETPROOF APPROVAL FALLBACK ---
        // If the data channel dropped the 'approved' message, the media call metadata will still deliver it!
        if (call.metadata && call.metadata.type === 'approved' && !isAdmin) {
            handleApproved(call.metadata.peers);
        }

        // Handle incoming media calls using the current active stream (camera or screen share)
        call.answer(getActiveStream());

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
        } else if (data.type === 'force-toggle-mute') {
            toggleAudio();
        } else if (data.type === 'kick') {
            alert("আপনাকে মিটিং থেকে বের করে দেওয়া হয়েছে। (You have been kicked by the host)");
            window.location.reload();
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
        // Removed stream.id check: PeerJS sometimes fires stream event multiple times (e.g. video then audio).
        // By passing it to addVideoStream, we ensure the latest stream with all tracks is attached.
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
        const call = peer.call(peerId, getActiveStream(), {
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

window.kickUser = function(peerId) {
    if (!isAdmin) return;
    const pData = peersData.get(peerId);
    if (pData && pData.connection) {
        pData.connection.send({ type: 'kick' });
        setTimeout(() => {
            if (pData.call) pData.call.close();
            if (pData.connection) pData.connection.close();
            removeUser(peerId);
        }, 500);
    }
};

function updateActiveCount() {
    const activeUsersBadge = document.getElementById('active-users-badge');
    const activeCountEl = document.getElementById('active-count');
    if (activeUsersBadge && activeCountEl) {
        activeUsersBadge.classList.remove('hidden');
        // Count all video containers in the grid
        const count = document.querySelectorAll('#video-grid .video-container').length;
        activeCountEl.innerText = count;
    }
}

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
            const call = peer.call(p.id, getActiveStream(), {metadata: {name: myName}});
            setupCallListeners(call, p.name);
        }, 500);
    });
}

// === Shared Video & Controls Functions ===
function addVideoStream(id, stream, name) {
    let container = document.getElementById(`video-container-${id}`);
    
    if (container) {
        // If container exists but stream changed (e.g. they reconnected quickly or audio track was added)
        const video = container.querySelector('video');
        if (video.srcObject !== stream) {
            video.srcObject = stream;
            video.play().catch(e => console.error("Play failed after updating stream:", e));
        }
        return;
    }

    container = document.createElement('div');
    container.id = `video-container-${id}`;
    container.className = 'video-container shadow-lg';

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false; // Explicitly ensure remote video is not muted
    
    // Explicitly play video to prevent mobile browsers from freezing the first frame or blocking audio
    video.onloadedmetadata = () => {
        video.play().catch(e => {
            console.error("Auto-play prevented by browser:", e);
            // Autoplay policy blocked the video/audio. Show a button to let the user manually play it.
            const playBtn = document.createElement('button');
            playBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Tap to Hear';
            playBtn.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold flex items-center gap-2";
            playBtn.onclick = () => {
                video.play();
                playBtn.remove();
            };
            container.appendChild(playBtn);
        });
    };

    const label = document.createElement('div');
    label.className = 'name-label';
    label.innerText = name;

    if (isAdmin && id !== adminPeerId) {
        const controls = document.createElement('div');
        controls.className = 'absolute top-2 right-2 flex gap-2 z-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100';
        
        const muteBtn = document.createElement('button');
        muteBtn.className = 'bg-gray-700 hover:bg-gray-600 w-8 h-8 rounded-full text-white shadow focus:outline-none';
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        muteBtn.title = 'Toggle Mute';
        muteBtn.onclick = () => {
            const pData = peersData.get(id);
            if(pData && pData.connection) {
                pData.connection.send({ type: 'force-toggle-mute' });
                muteBtn.classList.replace('bg-gray-700', 'bg-red-500');
                setTimeout(() => muteBtn.classList.replace('bg-red-500', 'bg-gray-700'), 300);
            }
        };
        
        const kickBtn = document.createElement('button');
        kickBtn.className = 'bg-red-600 hover:bg-red-700 w-8 h-8 rounded-full text-white shadow focus:outline-none';
        kickBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
        kickBtn.title = 'Kick User';
        kickBtn.onclick = () => window.kickUser(id);
        
        controls.appendChild(muteBtn);
        controls.appendChild(kickBtn);
        container.appendChild(controls);
        container.classList.add('group'); // Enable group-hover
    }

    container.appendChild(video);
    container.appendChild(label);
    videoAreaGrid.appendChild(container);
    updateActiveCount();
}

function removeUser(id) {
    const el = document.getElementById(`video-container-${id}`);
    if (el) el.remove();
    peersData.delete(id);
    
    updateActiveCount();
    
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
        if (btnPreviewAudio) {
            btnPreviewAudio.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            btnPreviewAudio.classList.replace('bg-gray-700', 'bg-red-600');
        }
    } else {
        audioTrack.enabled = true;
        btnToggleAudio.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        btnToggleAudio.classList.replace('bg-red-600', 'bg-gray-700');
        if (btnPreviewAudio) {
            btnPreviewAudio.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            btnPreviewAudio.classList.replace('bg-red-600', 'bg-gray-700');
        }
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
        if (btnPreviewVideo) {
            btnPreviewVideo.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
            btnPreviewVideo.classList.replace('bg-gray-700', 'bg-red-600');
            previewVideo.style.opacity = '0.3';
        }
    } else {
        videoTrack.enabled = true;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
        btnToggleVideo.classList.replace('bg-red-600', 'bg-gray-700');
        localVideo.style.opacity = '1';
        if (btnPreviewVideo) {
            btnPreviewVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
            btnPreviewVideo.classList.replace('bg-red-600', 'bg-gray-700');
            previewVideo.style.opacity = '1';
        }
    }
}

// === Screen Share Flow & Layout ===
async function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        try {
            // Optimize screen share bandwidth by capping framerate
            const displayConstraints = {
                video: {
                    frameRate: { ideal: 15, max: 30 }
                },
                audio: false
            };
            screenStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace track for all active calls
            peersData.forEach(p => {
                if (p.call) {
                    const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }
            });

            isScreenSharing = true;
            currentSharer = 'local';
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
    if (currentSharer === 'local') currentSharer = null;
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
    
    currentSharer = peerId;
    focusVideo.srcObject = peerData.stream;
    focusName.innerText = peerData.name + " (Screen)";
    
    focusContainer.classList.remove('hidden');
    videoAreaGrid.classList.remove('video-grid', 'overflow-y-auto');
    videoAreaGrid.classList.add('grid-focus-sidebar');
}

function handleScreenShareStop(peerId) {
    // Only close focus if the person stopping is the one currently in focus
    if (currentSharer !== peerId) return;
    
    currentSharer = null;
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

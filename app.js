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
const focusPanel = document.getElementById('focus-panel');
const focusContainer = document.getElementById('focus-container');
const focusVideo = document.getElementById('focus-video');
const focusName = document.getElementById('focus-name');
const focusPlaceholder = document.getElementById('focus-placeholder');
const participantsPanel = document.getElementById('participants-panel');
const localVideo = document.getElementById('local-video');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const btnToggleVideo = document.getElementById('btn-toggle-video');
const btnRaiseHand = document.getElementById('btn-raise-hand');
const btnLeave = document.getElementById('btn-leave');
const meetingRoleBadge = document.getElementById('meeting-role-badge');
const meetingFlowCopy = document.getElementById('meeting-flow-copy');
const stageTitle = document.getElementById('stage-title');
const stageCopy = document.getElementById('stage-copy');
const presenterChip = document.getElementById('presenter-chip');
const recordingChip = document.getElementById('recording-chip');
const gridCopy = document.getElementById('grid-copy');

// === State ===
let isAdmin = false;
let isCoHost = false;
let peer = null;
let localStream = null;
let adminPeerId = null;
let myName = "";
let isHandRaised = false;
let isLocalVideoEnabled = true;

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
let currentSharerRole = null;

let audioContext;
let audioDestination;
let reconnectTimer = null;
let orientationLockRequested = false;

// === Initialization ===
function init() {
    const localContainer = document.getElementById('video-container-local');
    if (localContainer) {
        ensureParticipantDecorations(localContainer, 'You');
    }

    setMeetingRoleUI();
    setPresentationLayout(false);
    setRecordingUI(false);
    setScreenShareButtonState(false);

    const hash = window.location.hash.substring(1);
    if (hash) {
        adminPeerId = hash;
        document.body.classList.add('invite-entry-mode');
        btnShowAdminLogin.classList.add('hidden');
        
        // Show preview and start camera immediately for privacy check before joining
        if (previewSection) {
            previewSection.classList.remove('hidden');
            startLocalVideo();
        }
    } else {
        document.body.classList.remove('invite-entry-mode');
    }
    setupEventListeners();
    window.addEventListener('resize', () => {
        syncSidebarForViewport();
        syncPresentationViewportMode(Boolean(currentSharer), currentSharerRole);
    });
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden-section'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden-section');
    }
}

function buildInviteLink(peerId) {
    const url = new URL(window.location.href);
    url.hash = peerId;
    return url.toString();
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
}

function schedulePeerReconnect() {
    if (!peer || peer.destroyed || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        if (!peer || peer.destroyed || !peer.disconnected) return;

        try {
            peer.reconnect();
        } catch (err) {
            console.error('Peer reconnect failed:', err);
        }
    }, 1500);
}

function isDesktopViewport() {
    return window.innerWidth >= 768;
}

function getLocalRoleKey() {
    if (isAdmin) return 'host';
    if (isCoHost) return 'cohost';
    return 'participant';
}

function isHostLikeRole(role) {
    return role === 'host' || role === 'cohost';
}

async function tryLockLandscapePresentation() {
    if (orientationLockRequested || !screen.orientation || !screen.orientation.lock) return;

    try {
        await screen.orientation.lock('landscape');
        orientationLockRequested = true;
    } catch (err) {
        console.debug('Orientation lock not available:', err);
    }
}

function releaseLandscapePresentationLock() {
    if (!screen.orientation || !screen.orientation.unlock) return;

    try {
        screen.orientation.unlock();
    } catch (err) {
        console.debug('Orientation unlock not available:', err);
    }

    orientationLockRequested = false;
}

function syncPresentationViewportMode(active = Boolean(currentSharer), sharerRole = currentSharerRole) {
    const shouldPrioritizeStage = active && !isDesktopViewport() && isHostLikeRole(sharerRole);
    document.body.classList.toggle('mobile-stage-priority', shouldPrioritizeStage);

    if (shouldPrioritizeStage) {
        tryLockLandscapePresentation();
        return;
    }

    releaseLandscapePresentationLock();
}

function syncSidebarForViewport() {
    if (!adminSidebar) return;

    if (isAdmin && isDesktopViewport()) {
        adminSidebar.classList.remove('hidden', 'translate-x-full');
        adminSidebar.classList.add('flex');
        if (sidebarBackdrop) {
            sidebarBackdrop.classList.add('hidden', 'opacity-0', 'pointer-events-none');
            sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
        }
        return;
    }

    adminSidebar.classList.add('hidden', 'translate-x-full');
    adminSidebar.classList.remove('flex');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.add('hidden', 'opacity-0', 'pointer-events-none');
        sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    }
}

function setMeetingRoleUI() {
    if (!meetingRoleBadge || !meetingFlowCopy) return;

    if (isAdmin) {
        meetingRoleBadge.innerHTML = '<i class="fa-solid fa-crown text-brand-400"></i> Host';
        meetingFlowCopy.textContent = 'Recording saves on this device.';
        return;
    }

    if (isCoHost) {
        meetingRoleBadge.innerHTML = '<i class="fa-solid fa-star text-brand-400"></i> Co-host';
        meetingFlowCopy.textContent = 'Host controls recording from the main device.';
        return;
    }

    meetingRoleBadge.innerHTML = '<i class="fa-solid fa-user-group text-brand-400"></i> Participant';
    meetingFlowCopy.textContent = 'Join and present from your own device.';
}

function setRecordButtonState(active) {
    if (!btnRecord) return;

    btnRecord.classList.remove('bg-slate-800', 'bg-red-600', 'text-slate-300', 'text-white');
    if (active) {
        btnRecord.classList.add('bg-red-600', 'text-white');
    } else {
        btnRecord.classList.add('bg-slate-800', 'text-slate-300');
    }
}

function setScreenShareButtonState(active) {
    if (!btnScreenShare) return;

    btnScreenShare.classList.remove('bg-slate-800', 'bg-brand-600', 'text-slate-300', 'text-white');
    if (active) {
        btnScreenShare.classList.add('bg-brand-600', 'text-white');
    } else {
        btnScreenShare.classList.add('bg-slate-800', 'text-slate-300');
    }
}

function setRecordingUI(active) {
    if (recordingIndicator) {
        recordingIndicator.classList.toggle('hidden', !active);
        recordingIndicator.classList.toggle('flex', active);
    }

    if (recordingChip) {
        recordingChip.innerHTML = active
            ? '<i class="fa-solid fa-circle-dot text-red-400"></i> Recording on host laptop'
            : '<i class="fa-solid fa-circle-dot text-amber-400"></i> Recording idle';
    }

    setRecordButtonState(active);
}

function getInitials(name) {
    const source = (name || 'User').trim();
    if (!source) return 'U';

    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map(part => part[0]).join('').toUpperCase();
}

function ensureParticipantDecorations(container, name) {
    let avatar = container.querySelector('.avatar-placeholder');
    if (!avatar) {
        avatar = document.createElement('div');
        avatar.className = 'avatar-placeholder hidden';
        avatar.innerHTML = `<div class="avatar-badge">${getInitials(name)}</div>`;
        container.appendChild(avatar);
    } else {
        const badge = avatar.querySelector('.avatar-badge');
        if (badge) badge.textContent = getInitials(name);
    }

    let cameraBadge = container.querySelector('.camera-state-badge');
    if (!cameraBadge) {
        cameraBadge = document.createElement('div');
        cameraBadge.className = 'camera-state-badge hidden';
        cameraBadge.innerHTML = '<i class="fa-solid fa-video-slash text-xs"></i>';
        container.appendChild(cameraBadge);
    }
}

function setParticipantVideoState(id, enabled, fallbackName = 'User') {
    const container = document.getElementById(`video-container-${id}`);
    const participantName = id === 'local' ? 'You' : (peersData.get(id)?.name || fallbackName);

    if (id === 'local') {
        isLocalVideoEnabled = enabled;
    } else {
        const participant = peersData.get(id);
        if (participant) participant.isVideoEnabled = enabled;
    }

    if (!container) return;

    ensureParticipantDecorations(container, participantName);
    container.classList.toggle('video-off-mode', !enabled);

    const video = container.querySelector('video');
    if (video) {
        video.style.opacity = enabled ? '1' : '0';
    }

    const avatar = container.querySelector('.avatar-placeholder');
    if (avatar) {
        avatar.classList.toggle('hidden', enabled);
    }

    const cameraBadge = container.querySelector('.camera-state-badge');
    if (cameraBadge) {
        cameraBadge.classList.toggle('hidden', enabled);
    }
}

function sendCurrentMediaState(conn) {
    if (!conn || !conn.open) return;
    conn.send({ type: 'video-toggle', enabled: isLocalVideoEnabled });
}

function broadcastLocalVideoState() {
    peersData.forEach(p => {
        if (p.connection && p.connection.open) {
            p.connection.send({ type: 'video-toggle', enabled: isLocalVideoEnabled });
        }
    });
}

function updateVideoGridLayout() {
    if (!videoAreaGrid) return;

    const count = videoAreaGrid.querySelectorAll('.video-container').length;
    const isPresenting = Boolean(currentSharer);

    videoAreaGrid.classList.remove('single-user', 'multi-user', 'share-mode');
    if (participantsPanel) {
        participantsPanel.classList.toggle('presenting-layout', isPresenting);
    }
    if (focusPanel) {
        focusPanel.classList.toggle('presenting-layout', isPresenting);
    }

    if (isPresenting) {
        videoAreaGrid.classList.add('share-mode');
        if (gridCopy) {
            gridCopy.textContent = isHostLikeRole(currentSharerRole)
                ? 'Presentation stays large. Cameras stay readable below.'
                : 'Presenter on stage. Cameras stay fixed below.';
        }
        return;
    }

    videoAreaGrid.classList.add(count <= 1 ? 'single-user' : 'multi-user');
    if (gridCopy) {
        gridCopy.textContent = count <= 1 ? 'Fixed camera view.' : 'Grid view.';
    }
}

function setPresentationLayout(active, sharerName = '', isLocalSharer = false, sharerRole = null) {
    if (focusPlaceholder) {
        focusPlaceholder.classList.toggle('hidden', active);
    }

    if (focusPanel) {
        focusPanel.classList.toggle('hidden', !active);
    }

    if (active) {
        currentSharerRole = sharerRole || currentSharerRole || (isLocalSharer ? getLocalRoleKey() : 'participant');
        const stageLabel = isLocalSharer ? 'You are presenting' : `${sharerName} is presenting`;
        if (stageTitle) {
            stageTitle.textContent = stageLabel;
        }
        if (stageCopy) {
            stageCopy.textContent = isLocalSharer
                ? 'The screen-share approval came from this device. Other users should only receive your presentation feed.'
                : `${sharerName}'s device granted the screen-share permission. Viewers should see the stage without receiving a local share prompt.`;
        }
        if (presenterChip) {
            presenterChip.innerHTML = `<i class="fa-solid fa-display text-brand-400"></i> ${stageLabel}`;
        }
        syncPresentationViewportMode(true, currentSharerRole);
        updateVideoGridLayout();
        return;
    }

    currentSharerRole = null;
    syncPresentationViewportMode(false);

    if (focusVideo) {
        focusVideo.srcObject = null;
    }
    if (focusName) {
        focusName.innerText = 'Presentation Stage';
    }
    if (stageTitle) {
        stageTitle.textContent = 'Ready for the room';
    }
    if (stageCopy) {
        stageCopy.textContent = 'When someone clicks present, that person\'s browser should ask for screen-share approval. Everyone else should only receive the shared view.';
    }
    if (presenterChip) {
        presenterChip.innerHTML = '<i class="fa-solid fa-display text-brand-400"></i> No one is presenting';
    }
    updateVideoGridLayout();
}

async function startLocalVideo() {
    if (localStream) return true; // Already started via preview
    
    try {
        // Optimize for global/weak networks: Limit resolution to 480p and enable audio optimizations
        const constraints = {
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 24, max: 30 }
            },
            audio: true // Simplified to avoid device-specific audio constraint failures
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        if (previewVideo) previewVideo.srcObject = localStream;
        setParticipantVideoState('local', localStream.getVideoTracks()[0].enabled, 'You');
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

    btnCopyLink.addEventListener('click', async () => {
        const inviteLink = inputInviteLink.value.trim();
        if (!inviteLink) {
            alert('Invite link is not ready yet. Wait a moment and try again.');
            return;
        }

        try {
            await copyTextToClipboard(inviteLink);
            btnCopyLink.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i><span class="hidden lg:inline">Copied</span>';
        } catch (err) {
            console.error('Copy failed:', err);
            alert('Could not copy the invite link automatically. Please copy it manually.');
        }

        setTimeout(() => {
            btnCopyLink.innerHTML = '<i class="fa-regular fa-copy"></i><span class="hidden lg:inline">Copy</span>';
        }, 2000);
    });

    btnRecord.addEventListener('click', toggleRecording);
    btnScreenShare.addEventListener('click', toggleScreenShare);
    btnRaiseHand.addEventListener('click', toggleRaiseHand);

    // Mobile Sidebar Toggles
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            adminSidebar.classList.remove('hidden', 'translate-x-full');
            adminSidebar.classList.add('flex');
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
    if (isDesktopViewport()) return;

    adminSidebar.classList.add('translate-x-full');
    sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    sidebarBackdrop.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        if (sidebarBackdrop.classList.contains('opacity-0')) {
            sidebarBackdrop.classList.add('hidden');
        }
        if (adminSidebar.classList.contains('translate-x-full')) {
            adminSidebar.classList.add('hidden');
            adminSidebar.classList.remove('flex');
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
        setMeetingRoleUI();
        screens.adminLogin.classList.add('hidden-section');
        
        const mediaSuccess = await startLocalVideo();
        if(!mediaSuccess) return;

        showScreen('meeting');
        adminControlsHeader.classList.remove('hidden');
        adminControlsHeader.classList.add('flex');
        if (btnToggleSidebar) btnToggleSidebar.classList.remove('hidden');
        btnRecord.classList.remove('hidden');
        btnRecord.classList.add('flex');
        setRecordButtonState(false);
        syncSidebarForViewport();

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
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        if (isAdmin) {
            adminPeerId = id;
            inputInviteLink.value = buildInviteLink(id);
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
            pendingRequests.set(conn.peer, {
                name: remoteName,
                conn,
                isVideoEnabled: conn.currentVideoEnabled !== false
            });
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
            schedulePeerReconnect();
        }
    });

    peer.on('disconnected', () => {
        console.warn('Peer disconnected from signaling server.');
        schedulePeerReconnect();
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
    conn.on('open', () => sendCurrentMediaState(conn));
    if (conn.open) sendCurrentMediaState(conn);

    conn.on('data', data => {
        if (data.type === 'request-join' && isAdmin) {
            if (!peersData.has(conn.peer)) {
                pendingRequests.set(conn.peer, {
                    name: data.name,
                    conn,
                    isVideoEnabled: conn.currentVideoEnabled !== false
                });
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
            handleScreenShareStart(conn.peer, data.role);
        } else if (data.type === 'screen-share-stop') {
            handleScreenShareStop(conn.peer);
        } else if (data.type === 'video-toggle') {
            conn.currentVideoEnabled = data.enabled;
            const participant = peersData.get(conn.peer);
            if (participant) {
                participant.isVideoEnabled = data.enabled;
            } else if (pendingRequests.has(conn.peer)) {
                pendingRequests.get(conn.peer).isVideoEnabled = data.enabled;
            }
            setParticipantVideoState(conn.peer, data.enabled, participant?.name || 'User');
        } else if (data.type === 'force-toggle-mute') {
            toggleAudio();
        } else if (data.type === 'kick') {
            alert("আপনাকে মিটিং থেকে বের করে দেওয়া হয়েছে। (You have been kicked by the host)");
            window.location.reload();
        } else if (data.type === 'hand-toggle') {
            toggleHandIcon(conn.peer, data.isRaised);
        } else if (data.type === 'make-cohost') {
            isCoHost = true;
            alert("You are now a Co-Host!");
            btnRecord.classList.remove('hidden'); // Co-Hosts can also record (via main host)
            btnRecord.classList.add('flex');
            setMeetingRoleUI();
            setRecordButtonState(isRecording);
            if (currentSharer === 'local' && isScreenSharing) {
                currentSharerRole = getLocalRoleKey();
                syncPresentationViewportMode(true, currentSharerRole);
            }
            // Re-render admin controls for existing videos
            document.querySelectorAll('#video-grid .video-container').forEach(container => {
                const vidId = container.id.replace('video-container-', '');
                if (vidId !== 'local' && vidId !== adminPeerId) {
                    addAdminControlsToContainer(container, vidId);
                }
            });
        } else if (data.type === 'request-record-toggle') {
            if (isAdmin && !isCoHost) toggleRecording();
        } else if (data.type === 'recording-state') {
            setRecordingUI(data.state);
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
            mobileRequestBadge.classList.add('flex');
            if (btnToggleSidebar) btnToggleSidebar.classList.add('animate-bounce');
            setTimeout(() => { if(btnToggleSidebar) btnToggleSidebar.classList.remove('animate-bounce'); }, 3000);
        } else {
            mobileRequestBadge.classList.add('hidden');
            mobileRequestBadge.classList.remove('flex');
        }
    }

    pendingRequests.forEach((req, peerId) => {
        const div = document.createElement('div');
        div.className = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between gap-3';
        div.innerHTML = `
            <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white" title="${req.name}">${req.name}</p>
                <p class="text-xs text-slate-500">Waiting for host approval</p>
            </div>
            <div class="flex shrink-0 gap-2">
                <button class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600" onclick="rejectUser('${peerId}')"><i class="fa-solid fa-xmark"></i></button>
                <button class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600" onclick="approveUser('${peerId}')"><i class="fa-solid fa-check"></i></button>
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
    peersData.set(peerId, {
        name: req.name,
        connection: req.conn,
        isVideoEnabled: req.isVideoEnabled !== false
    });
    
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
    if (!isAdmin && !isCoHost) return;
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
    const count = document.querySelectorAll('#video-grid .video-container').length;

    if (activeUsersBadge && activeCountEl) {
        activeUsersBadge.classList.remove('hidden');
        activeCountEl.innerText = count;
    }

    updateVideoGridLayout();
}

// === User Approved Flow ===
let isApproved = false;

function handleApproved(roomPeers) {
    if (isApproved) return;
    isApproved = true;
    
    showScreen('meeting');
    setMeetingRoleUI();
    setPresentationLayout(false);
    
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
        if (currentSharer === id && focusVideo.srcObject !== stream) {
            focusVideo.srcObject = stream;
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

    if ((isAdmin || isCoHost) && id !== adminPeerId) {
        addAdminControlsToContainer(container, id);
    }

    container.appendChild(video);
    container.appendChild(label);
    ensureParticipantDecorations(container, name);
    videoAreaGrid.appendChild(container);

    const isVideoEnabled = id === 'local'
        ? isLocalVideoEnabled
        : peersData.get(id)?.isVideoEnabled !== false;
    setParticipantVideoState(id, isVideoEnabled, name);

    updateActiveCount();
}

function addAdminControlsToContainer(container, id) {
    if (container.querySelector('.admin-controls-overlay')) return;

    const controls = document.createElement('div');
    controls.className = 'admin-controls-overlay absolute top-2 right-2 flex gap-2 z-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100';
    
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

    // Only Main Admin can assign Co-Hosts
    if (isAdmin && !isCoHost) {
        const hostBtn = document.createElement('button');
        hostBtn.className = 'bg-blue-600 hover:bg-blue-700 w-8 h-8 rounded-full text-white shadow focus:outline-none';
        hostBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
        hostBtn.title = 'Make Co-Host';
        hostBtn.onclick = () => {
            const pData = peersData.get(id);
            if(pData && pData.connection) {
                pData.connection.send({ type: 'make-cohost' });
                alert(pData.name + " is now a Co-Host!");
                hostBtn.remove();
            }
        };
        controls.appendChild(hostBtn);
    }
    
    container.appendChild(controls);
    container.classList.add('group'); // Enable group-hover
}

function removeUser(id) {
    if (currentSharer === id) {
        currentSharer = null;
        currentSharerRole = null;
        setPresentationLayout(false);
    }

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
        btnToggleAudio.classList.remove('bg-slate-800');
        btnToggleAudio.classList.add('bg-red-600');
        if (btnPreviewAudio) {
            btnPreviewAudio.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            btnPreviewAudio.classList.remove('bg-slate-800');
            btnPreviewAudio.classList.add('bg-red-600');
        }
    } else {
        audioTrack.enabled = true;
        btnToggleAudio.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        btnToggleAudio.classList.remove('bg-red-600');
        btnToggleAudio.classList.add('bg-slate-800');
        if (btnPreviewAudio) {
            btnPreviewAudio.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            btnPreviewAudio.classList.remove('bg-red-600');
            btnPreviewAudio.classList.add('bg-slate-800');
        }
    }
}

function toggleVideo() {
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        isLocalVideoEnabled = false;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
        btnToggleVideo.classList.remove('bg-slate-800');
        btnToggleVideo.classList.add('bg-red-600');
        setParticipantVideoState('local', false, 'You');
        if (btnPreviewVideo) {
            btnPreviewVideo.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
            btnPreviewVideo.classList.remove('bg-slate-800');
            btnPreviewVideo.classList.add('bg-red-600');
            previewVideo.style.opacity = '0.3';
        }
    } else {
        videoTrack.enabled = true;
        isLocalVideoEnabled = true;
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
        btnToggleVideo.classList.remove('bg-red-600');
        btnToggleVideo.classList.add('bg-slate-800');
        setParticipantVideoState('local', true, 'You');
        if (btnPreviewVideo) {
            btnPreviewVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
            btnPreviewVideo.classList.remove('bg-red-600');
            btnPreviewVideo.classList.add('bg-slate-800');
            previewVideo.style.opacity = '1';
        }
    }

    broadcastLocalVideoState();
}

function toggleRaiseHand() {
    isHandRaised = !isHandRaised;
    if (isHandRaised) {
        btnRaiseHand.classList.remove('bg-slate-800', 'text-slate-300');
        btnRaiseHand.classList.add('bg-amber-500', 'text-white');
    } else {
        btnRaiseHand.classList.remove('bg-amber-500', 'text-white');
        btnRaiseHand.classList.add('bg-slate-800', 'text-slate-300');
    }
    
    toggleHandIcon('local', isHandRaised);
    
    peersData.forEach(p => {
        if (p.connection) p.connection.send({ type: 'hand-toggle', isRaised: isHandRaised });
    });
}

function toggleHandIcon(peerId, isRaised) {
    const container = document.getElementById(`video-container-${peerId}`);
    if (!container) return;
    
    let handIcon = container.querySelector('.hand-icon');
    if (isRaised) {
        if (!handIcon) {
            handIcon = document.createElement('div');
            handIcon.className = 'hand-icon absolute top-2 left-2 bg-yellow-500 text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg z-20 animate-bounce';
            handIcon.innerHTML = '<i class="fa-solid fa-hand"></i>';
            container.appendChild(handIcon);
        }
    } else {
        if (handIcon) handIcon.remove();
    }
}

// === Screen Share Flow & Layout ===
async function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        try {
            // Request high-quality full screen video for screen sharing
            const displayConstraints = {
                video: {
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 }
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
            currentSharerRole = getLocalRoleKey();
            setScreenShareButtonState(true);

            // Broadcast
            peersData.forEach(p => {
                if (p.connection) {
                    p.connection.send({
                        type: 'screen-share-start',
                        role: currentSharerRole
                    });
                }
            });

            // Local layout update
            focusVideo.srcObject = screenStream;
            focusName.innerText = "You (Screen)";
            setPresentationLayout(true, myName || 'You', true, currentSharerRole);

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
    if (currentSharer === 'local') {
        currentSharer = null;
        currentSharerRole = null;
    }
    setScreenShareButtonState(false);

    // Revert track for all calls
    const cameraTrack = localStream.getVideoTracks()[0];
    peersData.forEach(p => {
        if (p.call) {
            const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(cameraTrack);
        }
        if (p.connection) p.connection.send({type: 'screen-share-stop'});
    });

    setPresentationLayout(false);
}

function handleScreenShareStart(peerId, sharerRole = 'participant') {
    const peerData = peersData.get(peerId);
    if (!peerData || !peerData.stream) return;
    
    currentSharer = peerId;
    currentSharerRole = sharerRole || 'participant';
    focusVideo.srcObject = peerData.stream;
    focusName.innerText = peerData.name + " (Screen)";
    setPresentationLayout(true, peerData.name, false, currentSharerRole);
}

function handleScreenShareStop(peerId) {
    // Only close focus if the person stopping is the one currently in focus
    if (currentSharer !== peerId) return;
    
    currentSharer = null;
    currentSharerRole = null;
    setPresentationLayout(false);
}

function leaveMeeting() {
    syncPresentationViewportMode(false);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peer) peer.destroy();
    window.location.reload();
}

// === Recording Functionality (With Audio Mixing) ===
async function toggleRecording() {
    if (isCoHost) {
        // Co-Host requests Main Host to record, to ensure the file saves on Main Host's device
        const pData = peersData.get(adminPeerId);
        if (pData && pData.connection) {
            pData.connection.send({ type: 'request-record-toggle' });
            btnRecord.classList.add('ring-2', 'ring-brand-400');
            setTimeout(() => btnRecord.classList.remove('ring-2', 'ring-brand-400'), 500);
        }
        return;
    }

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
        if (currentSharer === 'local' && screenStream) {
            // We are sharing our own screen, reuse it
            recordingVideoStream = screenStream;
            reusedScreenShare = true;
        } else if (currentSharer && peersData.has(currentSharer)) {
            // A remote user (like Co-Host) is sharing their screen! Record their stream directly!
            // No need to ask the Main Host for getDisplayMedia.
            recordingVideoStream = peersData.get(currentSharer).stream;
            reusedScreenShare = true;
        } else {
            // Request the user to select the screen to share (High Quality)
            recordingVideoStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { 
                    cursor: "always",
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30 }
                }, 
                audio: true 
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

        // Combine the screen video track with mixed audio when audio exists.
        const combinedTracks = [recordingVideoStream.getVideoTracks()[0]];
        const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
        if (mixedAudioTrack) {
            combinedTracks.push(mixedAudioTrack);
        }
        const combinedStream = new MediaStream(combinedTracks);
        
        mediaRecorder = new MediaRecorder(combinedStream, { 
            mimeType: 'video/webm;codecs=vp8,opus',
            videoBitsPerSecond: 3000000 // 3 Mbps for high quality video recording
        });
        
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
            setRecordingUI(false);
            
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            
            // Broadcast recording stopped
            peersData.forEach(p => { if(p.connection) p.connection.send({type: 'recording-state', state: false}); });
        };
        
        mediaRecorder.start();
        isRecording = true;
        setRecordingUI(true);
        
        // Broadcast recording started
        peersData.forEach(p => { if(p.connection) p.connection.send({type: 'recording-state', state: true}); });
        
        if (!reusedScreenShare) {
            recordingVideoStream.getVideoTracks()[0].onended = () => {
                if(isRecording) stopRecording();
            };
        }

    } catch (err) {
        console.error("Error starting recording:", err);
        alert("Could not start recording. If nobody is presenting, the host device may need its own screen capture permission.");
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

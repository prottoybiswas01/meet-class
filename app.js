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
const btnStageFullscreenEnter = document.getElementById('btn-stage-fullscreen-enter');
const btnStageFullscreenExit = document.getElementById('btn-stage-fullscreen-exit');
const participantsPanel = document.getElementById('participants-panel');
const localVideo = document.getElementById('local-video');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const btnToggleVideo = document.getElementById('btn-toggle-video');
const btnRaiseHand = document.getElementById('btn-raise-hand');
const btnLeave = document.getElementById('btn-leave');
const meetingFooter = document.getElementById('meeting-footer');
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
let remoteAudioUnlocked = false;
let recordingCanvas = null;
let recordingCanvasContext = null;
let recordingSourceVideo = null;
let recordingAnimationFrame = null;
let recordingCanvasStream = null;
const MIC_AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
};
const RECORDING_AUDIO_BOOST = 1.9;
const MAX_RECORDING_EDGE = 3840;

let audioContext;
let audioDestination;
let recordingMixCompressorNode = null;
let recordingMixGainNode = null;
const recordingAudioSources = new Map();
let reconnectTimer = null;
let orientationLockRequested = false;
let isManualStageFullscreen = false;
let stageControlsHideTimer = null;
let meetingClosed = false;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 30000;
const MEDIA_RETRY_DELAY_MS = 3000;
const connectionHeartbeatTimers = new Map();
const mediaRetryTimers = new Map();

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
    if (focusVideo) {
        focusVideo.addEventListener('loadedmetadata', updateStageViewportSizing);
        focusVideo.addEventListener('resize', updateStageViewportSizing);
    }
    document.addEventListener('fullscreenchange', updateStageViewportSizing);
    document.addEventListener('webkitfullscreenchange', updateStageViewportSizing);
    window.addEventListener('resize', () => {
        syncSidebarForViewport();
        syncPresentationViewportMode(Boolean(currentSharer), currentSharerRole);
        updateStageViewportSizing();
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

function getCurrentPresentationState() {
    if (!currentSharer) return null;

    const isLocalSharer = currentSharer === 'local';
    const sharerPeerId = isLocalSharer ? peer?.id : currentSharer;
    if (!sharerPeerId) return null;

    const remotePeerData = isLocalSharer ? null : peersData.get(currentSharer);
    return {
        peerId: sharerPeerId,
        sharerName: isLocalSharer ? (myName || 'You') : (remotePeerData?.name || 'Presenter'),
        role: isLocalSharer
            ? getLocalRoleKey()
            : (currentSharerRole || remotePeerData?.role || 'participant')
    };
}

function syncFocusVideoFromPresentationState(presentation) {
    if (!focusVideo || !presentation?.peerId) return;

    const isLocalSharer = peer?.id && presentation.peerId === peer.id;
    const targetStream = isLocalSharer
        ? screenStream
        : peersData.get(presentation.peerId)?.stream;

    if (!targetStream) return;

    focusVideo.srcObject = targetStream;
    focusVideo.play().catch(err => console.error('Focus video play failed:', err));
    requestAnimationFrame(updateStageViewportSizing);
}

function applyPresentationState(presentation) {
    if (!presentation?.peerId) return;

    const isLocalSharer = peer?.id && presentation.peerId === peer.id;
    if (isScreenSharing && currentSharer === 'local' && !isLocalSharer) {
        return;
    }

    currentSharer = isLocalSharer ? 'local' : presentation.peerId;
    currentSharerRole = presentation.role || 'participant';

    setPresentationLayout(true, presentation.sharerName || 'Presenter', isLocalSharer, currentSharerRole);
    if (focusName) {
        focusName.innerText = `${presentation.sharerName || (isLocalSharer ? 'You' : 'Presenter')} (Screen)`;
    }

    syncFocusVideoFromPresentationState(presentation);
}

function sendCurrentPresentationState(conn) {
    if (!conn || !conn.open) return;

    const presentation = getCurrentPresentationState();
    if (!presentation) return;

    conn.send({
        type: 'presentation-state',
        presentation
    });
}

function stopConnectionHeartbeat(peerId) {
    if (!connectionHeartbeatTimers.has(peerId)) return;
    clearInterval(connectionHeartbeatTimers.get(peerId));
    connectionHeartbeatTimers.delete(peerId);
}

function markConnectionAlive(conn) {
    if (!conn) return;
    conn.lastSeenAt = Date.now();
}

function endMeetingSession(reason = 'Meeting ended by host.') {
    if (meetingClosed) return;
    meetingClosed = true;

    if (reason) {
        alert(reason);
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (peer && !peer.destroyed) {
        try {
            peer.destroy();
        } catch (err) {
            console.debug('Peer destroy skipped during endMeetingSession:', err);
        }
    }

    window.location.reload();
}

function broadcastMeetingEnded(reason = 'Meeting ended by host.') {
    peersData.forEach(peerData => {
        if (peerData.connection?.open) {
            peerData.connection.send({ type: 'meeting-ended', reason });
        }
    });

    pendingRequests.forEach(request => {
        if (request.conn?.open) {
            request.conn.send({ type: 'meeting-ended', reason });
        }
    });
}

function startConnectionHeartbeat(conn) {
    if (!conn?.peer) return;

    stopConnectionHeartbeat(conn.peer);
    markConnectionAlive(conn);

    const timer = setInterval(() => {
        if (!conn.open) return;

        try {
            conn.send({ type: 'heartbeat', ts: Date.now() });
        } catch (err) {
            console.debug('Heartbeat send failed:', err);
        }

        if (!isAdmin && conn.peer === adminPeerId) {
            const lastSeenAt = conn.lastSeenAt || 0;
            if (Date.now() - lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
                endMeetingSession('Host disconnected. Meeting ended.');
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    connectionHeartbeatTimers.set(conn.peer, timer);
}

function stopMediaReconnect(peerId) {
    if (!mediaRetryTimers.has(peerId)) return;
    clearTimeout(mediaRetryTimers.get(peerId));
    mediaRetryTimers.delete(peerId);
}

function createCallMetadata(extra = {}) {
    return {
        name: myName,
        role: getLocalRoleKey(),
        ...extra
    };
}

function scheduleMediaReconnect(peerId) {
    if (!peerId || !peer || peer.destroyed || mediaRetryTimers.has(peerId)) return;

    const peerData = peersData.get(peerId);
    if (!peerData?.shouldInitiateCalls || !peerData.connection?.open) return;

    const timer = setTimeout(() => {
        mediaRetryTimers.delete(peerId);

        const latestPeerData = peersData.get(peerId);
        if (!latestPeerData?.shouldInitiateCalls || !latestPeerData.connection?.open || !peer || peer.destroyed) {
            return;
        }

        const connectionState = latestPeerData.call?.peerConnection?.connectionState;
        const iceState = latestPeerData.call?.peerConnection?.iceConnectionState;
        const looksBroken = ['failed', 'disconnected'].includes(connectionState)
            || ['failed', 'disconnected'].includes(iceState);

        if (!latestPeerData.call || looksBroken) {
            try {
                latestPeerData.call?.close();
            } catch (err) {
                console.debug('Previous call close skipped before retry:', err);
            }

            const retryCall = peer.call(peerId, getActiveStream(), {
                metadata: createCallMetadata()
            });
            setupCallListeners(retryCall, latestPeerData.name || 'User', { initiatedLocally: true });
        }
    }, MEDIA_RETRY_DELAY_MS);

    mediaRetryTimers.set(peerId, timer);
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

function resetStageViewportSizing() {
    if (!focusContainer) return;

    focusContainer.style.width = '';
    focusContainer.style.height = '';
    focusContainer.style.aspectRatio = '';
    focusContainer.style.maxWidth = '';
    focusContainer.style.maxHeight = '';
}

function updateStageViewportSizing() {
    if (!focusPanel || !focusContainer || !focusVideo) return;

    if (!currentSharer) {
        resetStageViewportSizing();
        return;
    }

    focusContainer.style.width = '100%';
    focusContainer.style.height = '100%';
    focusContainer.style.maxWidth = '100%';
    focusContainer.style.maxHeight = '100%';
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
    const shouldPrioritizeStage = active && !isDesktopViewport();
    document.body.classList.toggle('mobile-stage-priority', shouldPrioritizeStage);

    if (!shouldPrioritizeStage && !isManualStageFullscreen) {
        releaseLandscapePresentationLock();
    }
    syncStageFullscreenButtons(active);
}

function clearStageControlsHideTimer() {
    if (stageControlsHideTimer) {
        clearTimeout(stageControlsHideTimer);
        stageControlsHideTimer = null;
    }
}

function getActiveFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function syncStageFullscreenButtons(isPresenting = Boolean(currentSharer)) {
    if (!btnStageFullscreenEnter || !btnStageFullscreenExit) return;

    btnStageFullscreenEnter.classList.toggle('hidden', !isPresenting || isManualStageFullscreen);
    btnStageFullscreenExit.classList.toggle('hidden', !isPresenting || !isManualStageFullscreen);
}

function showStageFullscreenControlsTemporarily(duration = 2600) {
    if (!isManualStageFullscreen) return;

    document.body.classList.add('manual-stage-controls-visible');
    clearStageControlsHideTimer();
    stageControlsHideTimer = setTimeout(() => {
        document.body.classList.remove('manual-stage-controls-visible');
        stageControlsHideTimer = null;
    }, duration);
}

function applyManualStageFullscreenState(active) {
    isManualStageFullscreen = active;
    document.body.classList.toggle('manual-stage-fullscreen', active);
    document.body.classList.toggle('manual-stage-controls-visible', active);

    if (!active) {
        clearStageControlsHideTimer();
        document.body.classList.remove('manual-stage-controls-visible');
        releaseLandscapePresentationLock();
    } else {
        showStageFullscreenControlsTemporarily();
    }

    syncStageFullscreenButtons(Boolean(currentSharer));
    requestAnimationFrame(updateStageViewportSizing);
}

async function enterManualStageFullscreen() {
    if (!currentSharer || isManualStageFullscreen) return;

    applyManualStageFullscreenState(true);

    try {
        const fullscreenTarget = screens.meeting || document.documentElement;
        const requestFullscreenFn = fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen;
        if (!getActiveFullscreenElement() && requestFullscreenFn) {
            await requestFullscreenFn.call(fullscreenTarget);
        }
    } catch (err) {
        console.debug('Fullscreen request not available:', err);
    }

    await tryLockLandscapePresentation();
}

async function exitManualStageFullscreen() {
    if (!isManualStageFullscreen) return;

    applyManualStageFullscreenState(false);

    try {
        const exitFullscreenFn = document.exitFullscreen || document.webkitExitFullscreen;
        if (getActiveFullscreenElement() && exitFullscreenFn) {
            await exitFullscreenFn.call(document);
        }
    } catch (err) {
        console.debug('Fullscreen exit not available:', err);
    }
}

function handleBrowserFullscreenChange() {
    if (!getActiveFullscreenElement() && isManualStageFullscreen) {
        applyManualStageFullscreenState(false);
    }
}

function updatePeerRole(peerId, role) {
    if (!peerId || !role) return;

    const peerData = peersData.get(peerId);
    if (peerData) {
        peerData.role = role;
    }

    if (currentSharer === peerId) {
        currentSharerRole = role;
        syncPresentationViewportMode(true, currentSharerRole);
        updateVideoGridLayout();
    }
}

function broadcastPeerRoleUpdate(peerId, role) {
    peersData.forEach((peerData, id) => {
        if (id === peerId || !peerData.connection) return;

        peerData.connection.send({
            type: 'peer-role-update',
            peerId,
            role
        });
    });
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

function removeRemoteAudioButton(container) {
    const existingBtn = container?.querySelector('.remote-audio-btn');
    if (existingBtn) existingBtn.remove();
}

function showRemoteAudioButton(video, container) {
    const remoteStream = video?.srcObject;
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
    if (!container || container.querySelector('.remote-audio-btn')) return;

    const button = document.createElement('button');
    button.className = 'remote-audio-btn absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-brand-500';
    button.innerHTML = '<i class="fa-solid fa-volume-high"></i> Tap for sound';
    button.onclick = async () => {
        remoteAudioUnlocked = true;
        video.muted = false;
        video.defaultMuted = false;
        try {
            await video.play();
            removeRemoteAudioButton(container);
        } catch (err) {
            console.error('Remote audio unlock failed:', err);
        }
    };
    container.appendChild(button);
}

async function syncRemoteVideoPlayback(video, container) {
    if (!video) return;

    video.autoplay = true;
    video.playsInline = true;
    video.dataset.remoteVideo = 'true';

    if (!remoteAudioUnlocked) {
        video.muted = true;
        video.defaultMuted = true;
    }

    try {
        await video.play();
        if (remoteAudioUnlocked) {
            video.muted = false;
            video.defaultMuted = false;
            await video.play();
            removeRemoteAudioButton(container);
        } else {
            showRemoteAudioButton(video, container);
        }
    } catch (err) {
        console.error('Remote video autoplay blocked:', err);
        video.muted = true;
        video.defaultMuted = true;
        try {
            await video.play();
        } catch (playErr) {
            console.error('Muted remote video playback failed:', playErr);
        }
        showRemoteAudioButton(video, container);
    }
}

function unlockRemoteAudioPlayback() {
    if (remoteAudioUnlocked) return;
    remoteAudioUnlocked = true;

    document.querySelectorAll('video[data-remote-video="true"]').forEach(video => {
        video.muted = false;
        video.defaultMuted = false;
        video.play().catch(err => {
            console.error('Bulk remote audio unlock failed:', err);
            const container = video.closest('.video-container');
            showRemoteAudioButton(video, container);
        });
    });
}

function disconnectRecordingAudioSource(key) {
    const source = recordingAudioSources.get(key);
    if (!source) return;

    try {
        source.disconnect();
    } catch (err) {
        console.debug('Recording audio source disconnect skipped:', err);
    }

    recordingAudioSources.delete(key);
}

function resetRecordingAudioGraph() {
    Array.from(recordingAudioSources.keys()).forEach(disconnectRecordingAudioSource);
    recordingMixCompressorNode = null;
    recordingMixGainNode = null;
    audioDestination = null;
}

function createRecordingAudioGraph() {
    if (!audioContext) return;

    audioDestination = audioContext.createMediaStreamDestination();
    recordingMixCompressorNode = audioContext.createDynamicsCompressor();
    recordingMixCompressorNode.threshold.value = -24;
    recordingMixCompressorNode.knee.value = 18;
    recordingMixCompressorNode.ratio.value = 4;
    recordingMixCompressorNode.attack.value = 0.003;
    recordingMixCompressorNode.release.value = 0.2;

    recordingMixGainNode = audioContext.createGain();
    recordingMixGainNode.gain.value = RECORDING_AUDIO_BOOST;

    recordingMixCompressorNode.connect(recordingMixGainNode);
    recordingMixGainNode.connect(audioDestination);
}

function connectRecordingAudioSource(key, stream) {
    disconnectRecordingAudioSource(key);

    if (!audioContext || !recordingMixCompressorNode || !stream?.getAudioTracks?.().length) {
        return;
    }

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(recordingMixCompressorNode);
    recordingAudioSources.set(key, source);
}

function getSafeRecordingDimension(value, fallback) {
    const safeValue = Math.max(2, Math.round(value || fallback));
    return safeValue % 2 === 0 ? safeValue : safeValue + 1;
}

function getFullscreenRecordingSize(videoWidth, videoHeight) {
    const safeWidth = getSafeRecordingDimension(videoWidth, 1920);
    const safeHeight = getSafeRecordingDimension(videoHeight, 1080);
    const longestEdge = Math.max(safeWidth, safeHeight);

    if (longestEdge <= MAX_RECORDING_EDGE) {
        return { width: safeWidth, height: safeHeight };
    }

    const scale = MAX_RECORDING_EDGE / longestEdge;
    return {
        width: getSafeRecordingDimension(safeWidth * scale, 1920),
        height: getSafeRecordingDimension(safeHeight * scale, 1080)
    };
}

function stopRecordingRenderer() {
    if (recordingAnimationFrame) {
        cancelAnimationFrame(recordingAnimationFrame);
        recordingAnimationFrame = null;
    }

    if (recordingSourceVideo) {
        recordingSourceVideo.pause();
        recordingSourceVideo.srcObject = null;
        recordingSourceVideo.remove();
        recordingSourceVideo = null;
    }

    if (recordingCanvasStream) {
        recordingCanvasStream.getVideoTracks().forEach(track => track.stop());
        recordingCanvasStream = null;
    }

    recordingCanvasContext = null;
    recordingCanvas = null;
}

function renderRecordingFrame() {
    if (!recordingCanvas || !recordingCanvasContext || !recordingSourceVideo) return;

    const sourceWidth = recordingSourceVideo.videoWidth || recordingCanvas.width;
    const sourceHeight = recordingSourceVideo.videoHeight || recordingCanvas.height;
    if (!sourceWidth || !sourceHeight) {
        recordingAnimationFrame = requestAnimationFrame(renderRecordingFrame);
        return;
    }

    recordingCanvasContext.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCanvasContext.drawImage(
        recordingSourceVideo,
        0,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        recordingCanvas.width,
        recordingCanvas.height
    );
    recordingAnimationFrame = requestAnimationFrame(renderRecordingFrame);
}

async function createFullscreenRecordingStream(sourceStream, mixedAudioTrack) {
    const sourceTrack = sourceStream?.getVideoTracks?.()[0];
    if (!sourceTrack) {
        throw new Error('No video track available for recording.');
    }

    stopRecordingRenderer();
    const combinedStream = new MediaStream();
    const recorderVideoTrack = sourceTrack.clone();
    combinedStream.addTrack(recorderVideoTrack);

    if (mixedAudioTrack) {
        combinedStream.addTrack(mixedAudioTrack);
    }

    return combinedStream;
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
        requestAnimationFrame(updateStageViewportSizing);
        return;
    }

    if (isManualStageFullscreen) {
        exitManualStageFullscreen();
    }

    currentSharerRole = null;
    syncPresentationViewportMode(false);

    if (focusVideo) {
        focusVideo.srcObject = null;
    }
    resetStageViewportSizing();
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
        const mediaProfiles = [
            {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 24, max: 30 }
                },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: {
                    facingMode: 'user',
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 20, max: 24 }
                },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: { facingMode: 'user' },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: true,
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: true,
                audio: false
            }
        ];

        let lastError = null;
        for (const constraints of mediaProfiles) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            } catch (err) {
                lastError = err;
                console.warn('Media profile failed:', constraints, err);
            }
        }

        if (!localStream) {
            throw lastError || new Error('Could not access camera stream.');
        }

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
    document.addEventListener('click', unlockRemoteAudioPlayback, { passive: true, once: true });
    document.addEventListener('touchstart', unlockRemoteAudioPlayback, { passive: true, once: true });
    document.addEventListener('fullscreenchange', handleBrowserFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleBrowserFullscreenChange);
    window.addEventListener('pagehide', () => {
        if (isAdmin && !meetingClosed) {
            broadcastMeetingEnded('Meeting ended by host.');
        }
    });

    if (btnStageFullscreenEnter) {
        btnStageFullscreenEnter.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            enterManualStageFullscreen();
        });
    }

    if (btnStageFullscreenExit) {
        btnStageFullscreenExit.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            exitManualStageFullscreen();
        });
    }

    if (focusContainer) {
        const revealStageControls = () => {
            if (isManualStageFullscreen) {
                showStageFullscreenControlsTemporarily();
            }
        };
        focusContainer.addEventListener('click', revealStageControls);
        focusContainer.addEventListener('touchstart', revealStageControls, { passive: true });
    }

    if (meetingFooter) {
        meetingFooter.addEventListener('click', () => {
            if (isManualStageFullscreen) {
                showStageFullscreenControlsTemporarily();
            }
        });
    }
    
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
            const conn = peer.connect(adminPeerId, {metadata: {name: myName, role: getLocalRoleKey()}});
            peersData.set(adminPeerId, {name: "Host", connection: conn, role: 'host'});
            
            conn.on('open', () => conn.send({ type: 'request-join', name: myName }));
            setupConnectionListeners(conn);
        }
    });

    peer.on('connection', (conn) => {
        // Handle incoming data connections
        const remoteName = conn.metadata ? conn.metadata.name : "User";
        const remoteRole = conn.metadata ? conn.metadata.role : 'participant';
        
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
                peersData.set(conn.peer, {name: remoteName, connection: conn, role: remoteRole || 'participant'});
            } else {
                peersData.get(conn.peer).connection = conn;
                if (remoteRole) peersData.get(conn.peer).role = remoteRole;
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
            handleApproved(call.metadata.peers, call.metadata.presentation);
        }

        // Handle incoming media calls using the current active stream (camera or screen share)
        call.answer(getActiveStream());

        const remoteName = call.metadata ? call.metadata.name : "User";
        
        if (!peersData.has(call.peer)) {
            peersData.set(call.peer, {name: remoteName, role: call.metadata?.role || 'participant'});
        } else if (call.metadata?.role) {
            peersData.get(call.peer).role = call.metadata.role;
        }
        setupCallListeners(call, remoteName, { initiatedLocally: false });
    });
}

function setupConnectionListeners(conn) {
    const syncConnectionState = () => {
        markConnectionAlive(conn);
        sendCurrentMediaState(conn);
        sendCurrentPresentationState(conn);
        startConnectionHeartbeat(conn);
    };

    conn.on('open', syncConnectionState);
    if (conn.open) syncConnectionState();

    conn.on('data', data => {
        markConnectionAlive(conn);

        if (data.type === 'request-join' && isAdmin) {
            if (!peersData.has(conn.peer)) {
                pendingRequests.set(conn.peer, {
                    name: data.name,
                    conn,
                    isVideoEnabled: conn.currentVideoEnabled !== false
                });
                updateRequestsUI();
            }
        } else if (data.type === 'heartbeat') {
            return;
        } else if (data.type === 'approved' && !isAdmin) {
            handleApproved(data.peers, data.presentation);
        } else if (data.type === 'rejected' && !isAdmin) {
            alert("Your request to join was rejected by the admin.");
            window.location.reload();
        } else if (data.type === 'new-peer') {
            // Just register their info, wait for them to connect
            if (!peersData.has(data.id)) {
                peersData.set(data.id, {name: data.name, role: data.role || 'participant'});
            } else if (data.role) {
                peersData.get(data.id).role = data.role;
            }
        } else if (data.type === 'presentation-state') {
            applyPresentationState(data.presentation);
        } else if (data.type === 'screen-share-start') {
            handleScreenShareStart(conn.peer, data.role);
        } else if (data.type === 'screen-share-stop') {
            handleScreenShareStop(conn.peer);
        } else if (data.type === 'meeting-ended') {
            endMeetingSession(data.reason || 'Meeting ended by host.');
        } else if (data.type === 'peer-role-update') {
            updatePeerRole(data.peerId, data.role);
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

    conn.on('close', () => {
        stopConnectionHeartbeat(conn.peer);
        removeUser(conn.peer);
    });
}

function setupCallListeners(call, name, options = {}) {
    let pData = peersData.get(call.peer);
    if (!pData) {
        pData = {name: name, role: call.metadata?.role || 'participant'};
        peersData.set(call.peer, pData);
    } else if (call.metadata?.role) {
        pData.role = call.metadata.role;
    }

    if (options.initiatedLocally) {
        pData.shouldInitiateCalls = true;
    } else if (typeof pData.shouldInitiateCalls === 'undefined') {
        pData.shouldInitiateCalls = false;
    }

    pData.call = call;

    const peerConnection = call.peerConnection;
    const handleTransportStateChange = () => {
        const connectionState = peerConnection?.connectionState;
        const iceState = peerConnection?.iceConnectionState;
        if (['failed', 'disconnected'].includes(connectionState) || ['failed', 'disconnected'].includes(iceState)) {
            scheduleMediaReconnect(call.peer);
        }
    };

    if (peerConnection) {
        peerConnection.addEventListener('connectionstatechange', handleTransportStateChange);
        peerConnection.addEventListener('iceconnectionstatechange', handleTransportStateChange);
    }

    call.on('stream', stream => {
        // Removed stream.id check: PeerJS sometimes fires stream event multiple times (e.g. video then audio).
        // By passing it to addVideoStream, we ensure the latest stream with all tracks is attached.
        pData.stream = stream;
        stopMediaReconnect(call.peer);
        addVideoStream(call.peer, stream, name);
        
        // If recording is active, plug this new stream into the mix
        if (isRecording && audioContext && recordingMixCompressorNode) {
            connectRecordingAudioSource(`peer:${call.peer}`, stream);
        }
    });
    call.on('error', () => scheduleMediaReconnect(call.peer));
    call.on('close', () => {
        if (peerConnection) {
            peerConnection.removeEventListener('connectionstatechange', handleTransportStateChange);
            peerConnection.removeEventListener('iceconnectionstatechange', handleTransportStateChange);
        }
        removeUser(call.peer);
    });
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
    const activePresentation = getCurrentPresentationState();
    peersData.forEach((d, id) => {
        if (d.connection && id !== adminPeerId && id !== peerId) {
            currentPeers.push({id, name: d.name, role: d.role || 'participant'});
        }
    });

    req.conn.send({ type: 'approved', peers: currentPeers, presentation: activePresentation });
    
    // Attach connection listeners now that they are approved
    setupConnectionListeners(req.conn);
    peersData.set(peerId, {
        name: req.name,
        connection: req.conn,
        isVideoEnabled: req.isVideoEnabled !== false,
        role: 'participant'
    });
    
    // Broadcast new user to existing peers
    peersData.forEach((d, id) => {
        if (d.connection && id !== peerId && id !== adminPeerId) {
            d.connection.send({ type: 'new-peer', id: peerId, name: req.name, role: 'participant' });
        }
    });

    pendingRequests.delete(peerId);
    updateRequestsUI();

    // Admin initiates Media Call to the new user directly for highest reliability.
    // We pass the approval info in the metadata as a bulletproof fallback in case the Data Channel drops the message.
    setTimeout(() => {
        const call = peer.call(peerId, getActiveStream(), {
            metadata: createCallMetadata({
                type: 'approved',
                peers: currentPeers,
                presentation: activePresentation
            })
        });
        setupCallListeners(call, req.name, { initiatedLocally: true });
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

function handleApproved(roomPeers, presentation = null) {
    if (isApproved) return;
    isApproved = true;
    
    showScreen('meeting');
    setMeetingRoleUI();
    setPresentationLayout(false);
    
    // Admin will call us, so we just wait for Admin's call.
    // However, we need to call other existing peers in the room.
    roomPeers.forEach(p => {
        // Connect Data
        const conn = peer.connect(p.id, {metadata: {name: myName, role: getLocalRoleKey()}});
        let pData = peersData.get(p.id);
        if (!pData) {
            pData = {name: p.name, role: p.role || 'participant'};
            peersData.set(p.id, pData);
        }
        pData.connection = conn;
        setupConnectionListeners(conn);
        
        // Connect Media
        setTimeout(() => {
            const call = peer.call(p.id, getActiveStream(), {metadata: createCallMetadata()});
            setupCallListeners(call, p.name, { initiatedLocally: true });
        }, 500);
    });

    if (presentation) {
        applyPresentationState(presentation);
    }
}

// === Shared Video & Controls Functions ===
function addVideoStream(id, stream, name) {
    let container = document.getElementById(`video-container-${id}`);
    
    if (container) {
        // If container exists but stream changed (e.g. they reconnected quickly or audio track was added)
        const video = container.querySelector('video');
        if (video.srcObject !== stream) {
            video.srcObject = stream;
            syncRemoteVideoPlayback(video, container);
        }
        if (currentSharer === id && focusVideo.srcObject !== stream) {
            focusVideo.srcObject = stream;
            focusVideo.play().catch(e => console.error("Focus video play failed after updating stream:", e));
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
    
    // Explicitly play video to prevent mobile browsers from freezing the first frame or blocking audio
    video.onloadedmetadata = () => {
        syncRemoteVideoPlayback(video, container);
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
                pData.role = 'cohost';
                broadcastPeerRoleUpdate(id, 'cohost');
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
    stopConnectionHeartbeat(id);
    stopMediaReconnect(id);

    if (currentSharer === id) {
        currentSharer = null;
        currentSharerRole = null;
        setPresentationLayout(false);
    }

    disconnectRecordingAudioSource(`peer:${id}`);

    const el = document.getElementById(`video-container-${id}`);
    if (el) el.remove();
    peersData.delete(id);
    
    updateActiveCount();
    
    if (id === adminPeerId && !isAdmin) {
        endMeetingSession('Meeting ended by host.');
    }
}

function toggleAudio() {
    if(!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
        alert('Microphone is not available on this device/browser right now.');
        return;
    }
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
    currentSharer = peerId;
    currentSharerRole = sharerRole || peerData?.role || 'participant';
    const sharerName = peerData?.name || 'Presenter';

    setPresentationLayout(true, sharerName, false, currentSharerRole);

    if (focusName) {
        focusName.innerText = `${sharerName} (Screen)`;
    }

    if (peerData?.stream) {
        focusVideo.srcObject = peerData.stream;
        focusVideo.play().catch(err => console.error('Focus video play failed:', err));
        requestAnimationFrame(updateStageViewportSizing);
    }
}

function handleScreenShareStop(peerId) {
    // Only close focus if the person stopping is the one currently in focus
    if (currentSharer !== peerId) return;
    
    currentSharer = null;
    currentSharerRole = null;
    setPresentationLayout(false);
}

function leaveMeeting() {
    meetingClosed = true;

    if (isManualStageFullscreen) {
        applyManualStageFullscreenState(false);
    }

    if (isAdmin) {
        broadcastMeetingEnded('Meeting ended by host.');
    }

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
        createRecordingAudioGraph();

        // 1. Add Local Mic
        connectRecordingAudioSource('local-mic', localStream);

        // 2. Add All Remote Peers
        peersData.forEach((p, peerId) => {
            connectRecordingAudioSource(`peer:${peerId}`, p.stream);
        });

        // 3. Add Screen System Audio (if any and not reusing)
        if (!reusedScreenShare) {
            connectRecordingAudioSource('display-audio', recordingVideoStream);
        }

        const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
        const combinedStream = await createFullscreenRecordingStream(recordingVideoStream, mixedAudioTrack);
        
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
            resetRecordingAudioGraph();

            stopRecordingRenderer();
            
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
        stopRecordingRenderer();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        resetRecordingAudioGraph();
        if (!reusedScreenShare && recordingVideoStream) {
            recordingVideoStream.getTracks().forEach(track => track.stop());
        }
        alert("Could not start recording. If nobody is presenting, the host device may need its own screen capture permission.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        // Only stop the video track if we didn't reuse it from screen share
        if (!reusedScreenShare && recordingVideoStream) {
            recordingVideoStream.getVideoTracks().forEach(track => track.stop());
        }
    } else {
        stopRecordingRenderer();
    }
}

// Start app
init();

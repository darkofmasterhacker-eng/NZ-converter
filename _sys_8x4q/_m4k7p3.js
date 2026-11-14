(() => {
  'use strict';

  document.addEventListener('contextmenu', (e) => {
    if (!['TEXTAREA', 'INPUT'].includes(e.target.tagName)) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && e.key.toUpperCase() === 'U')
    ) {
      e.preventDefault();
    }
  });

  document.getElementById('year').textContent = new Date().getFullYear();

  const UNLOCK_KEY = 'nzh_converter_unlocked_v1';
  const lockScreen = document.getElementById('lock-screen');
  const mainApp = document.getElementById('main-app');
  const followBtn = document.getElementById('follow-channel-btn');
  const lockWaitMsg = document.getElementById('lock-wait-msg');

  let followClickedTime = 0;

  function unlockTool() {
    localStorage.setItem(UNLOCK_KEY, '1');
    lockScreen.classList.add('hidden');
    mainApp.classList.remove('locked-blur');
  }

  if (localStorage.getItem(UNLOCK_KEY) === '1') {
    unlockTool();
  } else {
    followBtn.addEventListener('click', () => {
      followClickedTime = Date.now();
      lockWaitMsg.classList.remove('hidden');
    });

    const tryAutoUnlockOnReturn = () => {
      if (
        followClickedTime > 0 &&
        document.visibilityState === 'visible' &&
        Date.now() - followClickedTime >= 1500
      ) {
        unlockTool();
      }
    };

    document.addEventListener('visibilitychange', tryAutoUnlockOnReturn);
    window.addEventListener('focus', () => {
      if (followClickedTime > 0 && Date.now() - followClickedTime >= 1500) {
        unlockTool();
      }
    });
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  function floatTo16BitPCM(float32Arr) {
    const int16 = new Int16Array(float32Arr.length);
    for (let i = 0; i < float32Arr.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Arr[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  function encodeAudioBufferToMp3(audioBuffer, onProgress) {
    return new Promise((resolve, reject) => {
      if (typeof lamejs === 'undefined') {
        reject(new Error('MP3 encoder load nahi hua.'));
        return;
      }

      const channels = Math.min(audioBuffer.numberOfChannels, 2);
      const sampleRate = audioBuffer.sampleRate;
      const leftPCM = floatTo16BitPCM(audioBuffer.getChannelData(0));
      const rightPCM = channels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

      const mp3Encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
      const mp3Data = [];
      const blockSize = 1152;
      const totalSamples = leftPCM.length;
      let offset = 0;

      const processChunk = () => {
        const chunkEnd = Math.min(offset + blockSize * 40, totalSamples);
        for (; offset < chunkEnd; offset += blockSize) {
          const leftChunk = leftPCM.subarray(offset, offset + blockSize);
          let mp3buf;
          if (channels === 2 && rightPCM) {
            const rightChunk = rightPCM.subarray(offset, offset + blockSize);
            mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
          } else {
            mp3buf = mp3Encoder.encodeBuffer(leftChunk);
          }
          if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }

        if (onProgress) onProgress(offset / totalSamples);

        if (offset < totalSamples) {
          setTimeout(processChunk, 0);
        } else {
          const endBuf = mp3Encoder.flush();
          if (endBuf.length > 0) mp3Data.push(endBuf);
          resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
        }
      };

      setTimeout(processChunk, 15);
    });
  }

  async function shareMp3File(blob, fileName, downloadAnchor, errorCallback) {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'audio/mp3' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Converter MP3 Audio',
          text: 'Converted via Converter (Developer: Nawab Zada Hacker)',
          files: [file]
        });
      } catch (err) {
        if (err.name !== 'AbortError' && errorCallback) {
          errorCallback('Direct share cancel ya fail ho gaya. Download button use karein.');
        }
      }
    } else {
      alert('Downloading error please shae audio on whatsapp.');
      downloadAnchor.click();
    }
  }

  const MAX_DURATION_SEC = 300;
  const videoInput = document.getElementById('video-input');
  const dropZone = document.getElementById('drop-zone');
  const fileLabel = document.getElementById('file-label');
  const videoMeta = document.getElementById('video-meta');
  const metaName = document.getElementById('meta-name');
  const metaDuration = document.getElementById('meta-duration');
  const convertBtn = document.getElementById('convert-btn');
  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');
  const resultBox = document.getElementById('result-box');
  const audioPreview = document.getElementById('audio-preview');
  const downloadBtn = document.getElementById('download-btn');
  const shareBtn = document.getElementById('share-btn');
  const videoError = document.getElementById('video-error');

  let selectedFile = null;
  let generatedMp3Blob = null;
  let generatedFileName = 'converted-audio.mp3';

  function showVideoError(msg) {
    videoError.textContent = msg;
    videoError.classList.remove('hidden');
  }

  function clearVideoError() {
    videoError.classList.add('hidden');
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function handleVideoSelect(file) {
    clearVideoError();
    resultBox.classList.add('hidden');
    progressWrap.classList.add('hidden');
    convertBtn.disabled = true;
    selectedFile = null;

    if (!file || !file.type.startsWith('video/')) {
      showVideoError('Please valid video select 1st.');
      return;
    }

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    const objUrl = URL.createObjectURL(file);

    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(objUrl);
      const dur = tempVideo.duration;

      if (!isFinite(dur) || dur <= 0) {
        showVideoError('Video duration read nahi ho saki.');
        return;
      }
      if (dur > MAX_DURATION_SEC) {
        showVideoError(`Video ${formatTime(dur)} ki hai. Sirf 5 minute (05:00) tak ki video allowed hai.`);
        return;
      }

      selectedFile = file;
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      generatedFileName = `${baseName}.mp3`;
      fileLabel.textContent = file.name;
      metaName.textContent = file.name;
      metaDuration.textContent = formatTime(dur);
      videoMeta.classList.remove('hidden');
      convertBtn.disabled = false;
    };

    tempVideo.onerror = () => {
      URL.revokeObjectURL(objUrl);
      showVideoError('loading error.');
    };

    tempVideo.src = objUrl;
  }

  videoInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleVideoSelect(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleVideoSelect(e.dataTransfer.files[0]);
  });

  function updateProgress(pct, label) {
    progressBar.style.width = `${pct}%`;
    progressPercent.textContent = `${pct}%`;
    if (label) progressStatus.textContent = label;
  }

  convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    clearVideoError();
    resultBox.classList.add('hidden');
    progressWrap.classList.remove('hidden');
    convertBtn.disabled = true;
    updateProgress(10, 'Video to audio converting...');

    let audioCtx;
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();

      updateProgress(25, 'audio genrating...');
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      updateProgress(35, 'audio genrating...');
      generatedMp3Blob = await encodeAudioBufferToMp3(audioBuffer, (ratio) => {
        const pct = Math.min(98, 35 + Math.round(ratio * 63));
        updateProgress(pct, 'audio genrating...');
      });

      const mp3Url = URL.createObjectURL(generatedMp3Blob);
      audioPreview.src = mp3Url;
      downloadBtn.href = mp3Url;
      downloadBtn.download = generatedFileName;

      updateProgress(100, 'Complete!');
      resultBox.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      showVideoError('Audio convert error.');
      progressWrap.classList.add('hidden');
    } finally {
      convertBtn.disabled = false;
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    }
  });

  shareBtn.addEventListener('click', () => {
    shareMp3File(generatedMp3Blob, generatedFileName, downloadBtn, showVideoError);
  });

  const ttsLang = document.getElementById('tts-lang');
  const ttsInput = document.getElementById('tts-input');
  const vcBtns = document.querySelectorAll('.vc-btn');
  const ttsConvertBtn = document.getElementById('tts-convert-btn');
  const ttsProgressWrap = document.getElementById('tts-progress-wrap');
  const ttsProgressStatus = document.getElementById('tts-progress-status');
  const ttsProgressPercent = document.getElementById('tts-progress-percent');
  const ttsProgressBar = document.getElementById('tts-progress-bar');
  const ttsResultBox = document.getElementById('tts-result-box');
  const ttsAudioPreview = document.getElementById('tts-audio-preview');
  const ttsDownloadBtn = document.getElementById('tts-download-btn');
  const ttsShareBtn = document.getElementById('tts-share-btn');
  const voiceError = document.getElementById('voice-error');

  let selectedVoiceMode = 'normal';
  let ttsMp3Blob = null;
  let ttsFileName = 'voice-normal.mp3';

  vcBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      vcBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedVoiceMode = btn.dataset.mode;
    });
  });

  function updateTtsProgress(pct, label) {
    ttsProgressBar.style.width = `${pct}%`;
    ttsProgressPercent.textContent = `${pct}%`;
    if (label) ttsProgressStatus.textContent = label;
  }

  function showVoiceError(msg) {
    voiceError.textContent = msg;
    voiceError.classList.remove('hidden');
  }

  async function applyVoiceChangerEffect(rawBuffer, mode) {
    let rate = 1.0;
    let extraTail = 0.05;

    if (mode === 'chipmunk') rate = 1.62;
    else if (mode === 'monster') rate = 0.68;
    else if (mode === 'girl') rate = 1.30;
    else if (mode === 'robot') rate = 1.06;
    else if (mode === 'ghost') {
      rate = 0.78;
      extraTail = 0.85;
    }

    const sampleRate = rawBuffer.sampleRate;
    const channels = rawBuffer.numberOfChannels;
    const outLength = Math.ceil((rawBuffer.duration / rate + extraTail) * sampleRate);

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineCtx = new OfflineCtx(channels, outLength, sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = rawBuffer;
    source.playbackRate.value = rate;

    if (mode === 'monster') {
      const lowFilter = offlineCtx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 1150;
      const bass = offlineCtx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 180;
      bass.gain.value = 6;
      source.connect(lowFilter);
      lowFilter.connect(bass);
      bass.connect(offlineCtx.destination);
    } else if (mode === 'robot') {
      const band = offlineCtx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1100;
      band.Q.value = 1.4;

      const modGain = offlineCtx.createGain();
      modGain.gain.value = 0.65;

      const osc = offlineCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 58;

      const oscAmp = offlineCtx.createGain();
      oscAmp.gain.value = 0.45;
      osc.connect(oscAmp);
      oscAmp.connect(modGain.gain);

      source.connect(band);
      band.connect(modGain);
      modGain.connect(offlineCtx.destination);
      osc.start(0);
    } else if (mode === 'ghost') {
      const delay = offlineCtx.createDelay();
      delay.delayTime.value = 0.25;
      const feedback = offlineCtx.createGain();
      feedback.gain.value = 0.42;

      source.connect(offlineCtx.destination);
      source.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(offlineCtx.destination);
    } else {
      source.connect(offlineCtx.destination);
    }

    source.start(0);
    return await offlineCtx.startRendering();
  }

  ttsConvertBtn.addEventListener('click', async () => {
    voiceError.classList.add('hidden');
    const text = ttsInput.value.trim();

    if (!text) {
      showVoiceError('1st write text.');
      return;
    }

    if (text.length > 800) {
      showVoiceError('Max 800 characters tak ka text likh sakte hain.');
      return;
    }

    ttsResultBox.classList.add('hidden');
    ttsProgressWrap.classList.remove('hidden');
    ttsConvertBtn.disabled = true;
    updateTtsProgress(15, 'Text to voice generating...');

    let audioCtx;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: ttsLang.value })
      });

      if (!res.ok) {
        let errText = 'Voice server error.';
        try {
          const j = await res.json();
          if (j.error) errText = j.error;
        } catch (_) {}
        throw new Error(errText);
      }

      const rawArrayBuffer = await res.arrayBuffer();
      updateTtsProgress(45, 'Voice changer effect applying...');

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      const decodedBuffer = await audioCtx.decodeAudioData(rawArrayBuffer);
      const processedBuffer = await applyVoiceChangerEffect(decodedBuffer, selectedVoiceMode);

      updateTtsProgress(70, 'audio genrating...');
      ttsMp3Blob = await encodeAudioBufferToMp3(processedBuffer, (ratio) => {
        const pct = Math.min(98, 70 + Math.round(ratio * 28));
        updateTtsProgress(pct, 'audio genrating...');
      });

      ttsFileName = `voice-${selectedVoiceMode}.mp3`;
      const mp3Url = URL.createObjectURL(ttsMp3Blob);
      ttsAudioPreview.src = mp3Url;
      ttsDownloadBtn.href = mp3Url;
      ttsDownloadBtn.download = ttsFileName;

      updateTtsProgress(100, 'Complete!');
      ttsResultBox.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      showVoiceError(err.message || 'Error try again.');
      ttsProgressWrap.classList.add('hidden');
    } finally {
      ttsConvertBtn.disabled = false;
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    }
  });

  ttsShareBtn.addEventListener('click', () => {
    shareMp3File(ttsMp3Blob, ttsFileName, ttsDownloadBtn, showVoiceError);
  });
})();

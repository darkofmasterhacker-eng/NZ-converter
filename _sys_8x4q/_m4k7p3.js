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
      showVideoError('Please ek valid video file select krein.');
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
      showVideoError('Ye video format browser mein load nahi ho skta.');
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

  function floatTo16BitPCM(float32Arr) {
    const int16 = new Int16Array(float32Arr.length);
    for (let i = 0; i < float32Arr.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Arr[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  function updateProgress(pct, label) {
    progressBar.style.width = `${pct}%`;
    progressPercent.textContent = `${pct}%`;
    if (label) progressStatus.textContent = label;
  }

  convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    if (typeof lamejs === 'undefined') {
      showVideoError('Internet connection.');
      return;
    }

    clearVideoError();
    resultBox.classList.add('hidden');
    progressWrap.classList.remove('hidden');
    convertBtn.disabled = true;
    updateProgress(5, 'Video se audio extract ho rahi hai...');

    let audioCtx;
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();

      updateProgress(20, 'Audio decode ho rahi hai...');
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const channels = Math.min(audioBuffer.numberOfChannels, 2);
      const sampleRate = audioBuffer.sampleRate;
      const leftPCM = floatTo16BitPCM(audioBuffer.getChannelData(0));
      const rightPCM = channels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

      const mp3Encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
      const mp3Data = [];
      const blockSize = 1152;
      const totalSamples = leftPCM.length;

      updateProgress(30, 'audio mein convert ho rahi hai...');

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

        const pct = Math.min(95, 30 + Math.round((offset / totalSamples) * 65));
        updateProgress(pct, 'converting...');

        if (offset < totalSamples) {
          setTimeout(processChunk, 0);
        } else {
          const endBuf = mp3Encoder.flush();
          if (endBuf.length > 0) mp3Data.push(endBuf);

          generatedMp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
          const mp3Url = URL.createObjectURL(generatedMp3Blob);

          audioPreview.src = mp3Url;
          downloadBtn.href = mp3Url;
          downloadBtn.download = generatedFileName;

          updateProgress(100, 'Complete!');
          resultBox.classList.remove('hidden');
          convertBtn.disabled = false;
        }
      };

      setTimeout(processChunk, 20);
    } catch (err) {
      console.error(err);
      showVideoError('Audio convert error.');
      progressWrap.classList.add('hidden');
      convertBtn.disabled = false;
    } finally {
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!generatedMp3Blob) return;
    const file = new File([generatedMp3Blob], generatedFileName, { type: 'audio/mp3' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Converted MP3 Audio',
          text: 'Converted via Converter (Developer: Nawab Zada Hacker)',
          files: [file]
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          showVideoError('error, download again.');
        }
      }
    } else {
      alert('Aap ka browser direct MP3 file share support nahi karta (Mobile Chrome/Safari mein WhatsApp direct share chalta hai). File download ho rahi hai, phir ap WhatsApp phr bhej skty hain.');
      downloadBtn.click();
    }
  });

  const voiceSelect = document.getElementById('voice-select');
  const ttsInput = document.getElementById('tts-input');
  const vcBtns = document.querySelectorAll('.vc-btn');
  const stopVoiceBtn = document.getElementById('stop-voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const speakingLabel = document.getElementById('speaking-label');
  const voiceError = document.getElementById('voice-error');

  let voices = [];

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';

    if (voices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Default System Voice';
      voiceSelect.appendChild(opt);
      return;
    }

    voices.forEach((v, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
  }

  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  } else {
    voiceError.textContent = 'Aap ka browser Text-to-Speech support nahi karta.';
    voiceError.classList.remove('hidden');
  }

  vcBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      voiceError.classList.add('hidden');
      const text = ttsInput.value.trim();
      if (!text) {
        voiceError.textContent = 'Pehle box mein kuch text likhein.';
        voiceError.classList.remove('hidden');
        return;
      }

      if (!('speechSynthesis' in window)) return;

      window.speechSynthesis.cancel();
      vcBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const utter = new SpeechSynthesisUtterance(text);
      const selectedIdx = voiceSelect.value;
      if (voices[selectedIdx]) utter.voice = voices[selectedIdx];

      utter.pitch = parseFloat(btn.dataset.pitch);
      utter.rate = parseFloat(btn.dataset.rate);

      utter.onstart = () => {
        speakingLabel.textContent = `Speaking (${btn.dataset.mode} Mode)...`;
        voiceStatus.classList.remove('hidden');
      };
      utter.onend = () => voiceStatus.classList.add('hidden');
      utter.onerror = () => voiceStatus.classList.add('hidden');

      window.speechSynthesis.speak(utter);
    });
  });

  stopVoiceBtn.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    voiceStatus.classList.add('hidden');
    vcBtns.forEach((b) => b.classList.remove('active'));
  });
})();

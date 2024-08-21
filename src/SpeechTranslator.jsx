import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const SpeechTranslator = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [translationHistory, setTranslationHistory] = useState([]);
  const audioContext = useRef(null);
  const audioChunks = useRef([]);
  const processingInterval = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.current.createMediaStreamSource(stream);
      const processor = audioContext.current.createScriptProcessor(1024, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.current.destination);

      processor.onaudioprocess = (e) => {
        const audioData = e.inputBuffer.getChannelData(0);
        audioChunks.current.push(new Float32Array(audioData));
      };

      setIsRecording(true);
      processingInterval.current = setInterval(processAudioChunk, 3000); // Process every 3 seconds
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (audioContext.current && isRecording) {
      audioContext.current.close();
      clearInterval(processingInterval.current);
      setIsRecording(false);
    }
  };

  const processAudioChunk = async () => {
    if (audioChunks.current.length === 0) return;

    const audioBlob = encodeWAV(audioChunks.current);
    audioChunks.current = [];
    setIsProcessing(true);

    await transcribeAndTranslate(audioBlob);
    setIsProcessing(false);
  };

  const encodeWAV = (audioChunks) => {
    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    let totalLength = 0;
    for (const chunk of audioChunks) {
      totalLength += chunk.length;
    }

    const buffer = new ArrayBuffer(44 + totalLength * 2);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength * 2, true);

    let offset = 44;
    for (const chunk of audioChunks) {
      for (let i = 0; i < chunk.length; i++) {
        const sample = Math.max(-1, Math.min(1, chunk[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const transcribeAndTranslate = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ar');

    try {
      const transcriptionResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const newArabicText = transcriptionResponse.data.text;
      if (newArabicText.trim() === '') return; // Skip empty transcriptions

      const translationResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo",
        messages: [
          {"role": "system", "content": "You are a helpful assistant that translates Arabic to English. Keep English words that are spoken as English."},
          {"role": "user", "content": `Translate the following Arabic text to English: "${newArabicText}"`}
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const newEnglishTranslation = translationResponse.data.choices[0].message.content;

      setTranslationHistory(prev => [{ arabic: newArabicText, english: newEnglishTranslation }, ...prev]);
    } catch (error) {
      console.error('Error in transcription or translation:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
      if (processingInterval.current) {
        clearInterval(processingInterval.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100">
      <h1 className="mb-8 text-4xl font-bold text-center">Arabic to English Speech Translator</h1>
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={`px-6 py-3 rounded-full text-lg ${
          isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
        } text-white font-bold mb-8 transition-colors duration-300`}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      {isProcessing && (
        <div className="mb-4 text-xl text-blue-600">Processing audio...</div>
      )}
      <div className="w-full max-w-2xl space-y-6 overflow-y-auto max-h-[60vh]">
        {translationHistory.map((item, index) => (
          <div key={index} className="p-4 bg-white rounded-lg shadow">
            <p className="mb-2 text-lg text-right" dir="rtl">{item.arabic}</p>
            <p className="text-lg">{item.english}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpeechTranslator;
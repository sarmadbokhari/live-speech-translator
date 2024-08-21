import React, { useState, useRef } from 'react';
import axios from 'axios';

const SpeechTranslator = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [arabicText, setArabicText] = useState('');
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        await transcribeAndTranslate(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setArabicText('');
      setEnglishTranslation('');
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const transcribeAndTranslate = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ar');  // Specify Arabic as the source language

    try {
      // Step 1: Transcribe audio using Whisper API
      const transcriptionResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const arabicText = transcriptionResponse.data.text;
      setArabicText(arabicText);

      // Step 2: Translate Arabic text to English using GPT-3.5
      const translationResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo",
        messages: [
          {"role": "system", "content": "You are a helpful assistant that translates Arabic to English. Keep English words that are spoken as English."},
          {"role": "user", "content": `Translate the following Arabic text to English: "${arabicText}"`}
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const englishTranslation = translationResponse.data.choices[0].message.content;
      setEnglishTranslation(englishTranslation);
    } catch (error) {
      console.error('Error in transcription or translation:', error);
      setArabicText('Error processing audio.');
      setEnglishTranslation('Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100">
      <h1 className="mb-8 text-4xl font-bold text-center">Arabic to English Speech Translator</h1>
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={`px-6 py-3 rounded-full text-lg ${
          isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
        } text-white font-bold mb-8 transition-colors duration-300`}
        disabled={isProcessing}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      {isProcessing && (
        <div className="mb-4 text-xl text-blue-600">Processing audio...</div>
      )}
      <div className="w-full max-w-2xl space-y-6">
        <div className="p-6 bg-white rounded-lg shadow-lg">
          <h2 className="mb-4 text-2xl font-semibold text-right">Arabic (Original)</h2>
          <p className="text-xl text-right" dir="rtl">{arabicText || 'Recorded Arabic text will appear here'}</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-lg">
          <h2 className="mb-4 text-2xl font-semibold">English (Translation)</h2>
          <p className="text-xl">{englishTranslation || 'English translation will appear here'}</p>
        </div>
      </div>
    </div>
  );
};

export default SpeechTranslator;
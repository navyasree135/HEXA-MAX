import React, { useState, useRef, useEffect } from 'react';
import api from '../api';

const ReportComplaint = () => {
  const [user, setUser] = useState(null);
  
  // Audio state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [time, setTime] = useState(0);
  const [language, setLanguage] = useState('en-US');
  
  // Process State
  const [step, setStep] = useState(1); // 1: Input, 2: Transcribe/Edit, 3: Location, 4: Result
  const [processing, setProcessing] = useState(false);
  
  // Complaint State
  const [transcript, setTranscript] = useState('');
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [location, setLocation] = useState({ area: '', city: '', state: '', postal_code: '', latitude: '', longitude: '' });
  const [useRegisteredLocation, setUseRegisteredLocation] = useState(false);
  
  // Result
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await api.get('/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }
    
    setError('');
    setTranscript('');
    setRecording(true);
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript + ' ';
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
      if (transcript.length > 0 || recognitionRef.current?.transcript?.length > 0) {
        setStep(2);
      }
    };

    mediaRecorderRef.current = recognition;
    recognition.start();
    
    setTime(0);
    timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
      if (transcript.trim().length > 0) {
        setProcessing(true);
        try {
          const formData = new FormData();
          formData.append('transcript', transcript);
          
          const token = localStorage.getItem('access_token');
          const res = await api.post('/issues/draft', formData, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          setEnglishTranslation(res.data.english_translation || transcript);
          setAiSummary(res.data.summary || '');
          setCategory(res.data.category || '');
          setPriority(res.data.priority || 'medium');
        } catch (err) {
          console.error("Draft parsing failed", err);
          setEnglishTranslation(transcript);
        } finally {
          setProcessing(false);
          setStep(2);
        }
      } else {
        setError("Could not hear anything. Please try again.");
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const processAudio = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    setError('');
    
    try {
      const formData = new FormData();
      // Ensure we pass the correct file name/extension for ogg if applicable
      const ext = audioBlob.name ? audioBlob.name.split('.').pop() : 'mp3';
      formData.append('audio_file', audioBlob, `complaint.${ext}`);
      
      const token = localStorage.getItem('access_token');
      const response = await api.post('/issues/transcribe', formData, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      
      const sttText = response.data.transcript;
      
      // Process through AI Draft endpoint
      try {
        const draftFormData = new FormData();
        draftFormData.append('transcript', sttText);
        
        const transRes = await api.post('/issues/draft', draftFormData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setEnglishTranslation(transRes.data.english_translation || sttText);
        setAiSummary(transRes.data.summary || '');
        setCategory(transRes.data.category || '');
        setPriority(transRes.data.priority || 'medium');
      } catch (err) {
        setEnglishTranslation(sttText);
      }

      setTranscript(sttText);
      setStep(2);
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Unknown error occurred.';
      setError(`Failed to transcribe audio: ${errMsg}`);
    } finally {
      setProcessing(false);
    }
  };

  const submitComplaint = async () => {
    setProcessing(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('transcript', englishTranslation || transcript);
      if (aiSummary) formData.append('ai_summary', aiSummary);
      if (category) formData.append('category', category);
      if (priority) formData.append('priority', priority);
      
      const locData = useRegisteredLocation && user ? {
        ward: user.area,
        location_lat: user.latitude,
        location_lng: user.longitude
      } : {
        ward: location.area,
        location_lat: location.latitude ? parseFloat(location.latitude) : undefined,
        location_lng: location.longitude ? parseFloat(location.longitude) : undefined
      };

      if (locData.ward) formData.append('ward', locData.ward);
      if (locData.location_lat) formData.append('location_lat', locData.location_lat);
      if (locData.location_lng) formData.append('location_lng', locData.location_lng);
      
      if (audioBlob) {
        formData.append('audio_file', audioBlob, 'complaint.mp3');
      }

      const token = localStorage.getItem('access_token');
      const response = await api.post('/issues', formData, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      
      setResult(response.data);
      setStep(4);
    } catch (err) {
      setError('Failed to submit complaint.');
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Welcome, {user?.name || 'Citizen'}</h2>
          <p className="text-secondary">Report a problem in your area easily using voice or text.</p>
        </div>
        
        {user && (
          <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: 0, minWidth: '250px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Credibility Score</span>
              <span style={{ fontWeight: 700, color: user.credibility_score < 0.5 ? 'var(--error)' : 'var(--success)' }}>
                {(user.credibility_score * 100).toFixed(0)} / 100
              </span>
            </div>
            <div className="score-meter">
              <div 
                className="score-fill" 
                style={{ 
                  width: `${user.credibility_score * 100}%`,
                  background: user.credibility_score < 0.5 ? 'var(--error)' : 'var(--success)'
                }}
              ></div>
            </div>
            <p className="text-secondary mt-2" style={{ fontSize: '0.75rem', margin: 0 }}>
              {user.credibility_score < 0.5 
                ? 'Warning: Submitting false reports has reduced your score.' 
                : 'Maintain a high score for faster grievance resolution.'}
            </p>
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 1 && (
        <div className="card text-center">
          <h3>🎙️ Report a Problem</h3>
          <p className="mb-4">Record or upload your complaint.</p>
          
          <div style={{ marginBottom: '2rem' }}>
            {!recording ? (
              <>
                <div className="mb-3">
                  <select 
                    className="form-control" 
                    style={{maxWidth: '200px', margin: '0 auto', display: 'inline-block'}} 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="en-US">English</option>
                    <option value="te-IN">Telugu (తెలుగు)</option>
                    <option value="hi-IN">Hindi (हिंदी)</option>
                    <option value="ta-IN">Tamil (தமிழ்)</option>
                    <option value="mr-IN">Marathi (ମରାଠୀ)</option>
                    <option value="bn-IN">Bengali (বাংলা)</option>
                    <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                    <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
                    <option value="ml-IN">Malayalam (മലയാളം)</option>
                    <option value="pa-IN">Punjabi (ਪੰਜਾਬੀ)</option>
                    <option value="ur-IN">Urdu (اردو)</option>
                    <option value="or-IN">Odia (ଓଡ଼ିଆ)</option>
                  </select>
                </div>
                <button className="mic-btn" onClick={startRecording} title="Start Recording">🎤</button>
              </>
            ) : (
              <div className="text-center">
                <button className="mic-btn recording" onClick={stopRecording} title="Stop Recording">⏹️</button>
                <div className="mt-2 text-danger">🔴 Recording & Transcribing... {formatTime(time)}</div>
                <div className="mt-3 p-3" style={{background: '#f8f9fa', borderRadius: '8px', minHeight: '60px'}}>
                  {transcript || "Listening..."}
                </div>
              </div>
            )}
          </div>

          <div className="mb-4">
            <input type="file" accept="audio/*,.ogg" ref={fileInputRef} onChange={handleFileUpload} style={{display: 'none'}} />
            <button className="btn" onClick={() => fileInputRef.current.click()} style={{border: '1px solid var(--border)'}}>
              📁 Upload Audio File (.mp3, .ogg, .wav)
            </button>
          </div>

          {audioUrl && (
            <div className="mt-4 p-3" style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius)' }}>
              <h5>Audio Ready</h5>
              <audio src={audioUrl} controls className="mb-3" style={{width: '100%'}} />
              <button className="btn btn-primary" onClick={processAudio} disabled={processing} style={{width: '100%'}}>
                {processing ? 'Processing Audio...' : 'Next Step'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Review Transcription</h3>
          <p className="text-secondary">Please review your original text and the English translation.</p>
          
          <div className="form-group mt-3">
            <label>Original Spoken Text</label>
            <textarea 
              className="form-control" 
              rows="4" 
              value={transcript} 
              onChange={(e) => setTranscript(e.target.value)}
              style={{background: '#f8f9fa'}}
            />
          </div>

          <div className="form-group mt-3">
            <label>English Translation (This will be saved to the database)</label>
            <textarea 
              className="form-control" 
              rows="4" 
              value={englishTranslation} 
              onChange={(e) => setEnglishTranslation(e.target.value)}
              style={{border: '1px solid var(--primary-blue)'}}
            />
          </div>
          
          <div className="grid grid-2 mt-4">
            <button className="btn" onClick={() => setStep(1)} style={{border: '1px solid var(--border)'}}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Confirm & Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>Where is the problem?</h3>
          
          <div className="form-group mt-3">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={useRegisteredLocation} 
                onChange={(e) => setUseRegisteredLocation(e.target.checked)} 
              />
              Use my registered location
            </label>
          </div>

          {!useRegisteredLocation && (
            <div className="mt-3">
              <div className="grid grid-2">
                <div className="form-group">
                  <label>Area</label>
                  <input type="text" className="form-control" value={location.area} onChange={e => setLocation({...location, area: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input type="text" className="form-control" value={location.city} onChange={e => setLocation({...location, city: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 p-3 mb-4" style={{ background: 'var(--background)', borderRadius: 'var(--radius)' }}>
            <h5>AI Analysis (Read-Only)</h5>
            <p className="text-secondary mb-3">
              The AI has analyzed your complaint and assigned the following details. This ensures accurate routing to the correct department.
            </p>
            <div className="form-group mb-3">
              <label>AI Summary</label>
              <div className="p-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                {aiSummary || 'No summary generated.'}
              </div>
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label>Category / Department</label>
                <select 
                  className="form-control" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ fontWeight: 'bold', background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <option value="Water & Sanitation">Water & Sanitation</option>
                  <option value="Electricity & Power">Electricity & Power</option>
                  <option value="Roads & Infrastructure">Roads & Infrastructure</option>
                  <option value="Waste Management">Waste Management</option>
                  <option value="Public Health">Public Health</option>
                  <option value="Municipal Administration">Municipal Administration</option>
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <div className="p-2" style={{ 
                  background: 'var(--surface)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 'var(--radius)', 
                  fontWeight: 'bold',
                  color: priority === 'high' ? 'var(--danger)' : priority === 'medium' ? 'var(--warning)' : 'var(--success)'
                }}>
                  {priority ? priority.toUpperCase() : 'MEDIUM'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-2 mt-4">
            <button className="btn" onClick={() => setStep(2)} style={{border: '1px solid var(--border)'}}>Back</button>
            <button className="btn btn-primary" onClick={submitComplaint} disabled={processing}>
              {processing ? 'Analyzing & Submitting...' : 'Submit Complaint'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="card text-center" style={{ borderTop: '4px solid var(--success)' }}>
          <h2 style={{color: 'var(--success)'}}>✓ Complaint Submitted</h2>
          <p className="mt-3 text-secondary">Your grievance has been classified and forwarded to the respective department.</p>
          
          <div className="mt-4 text-left" style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: 'var(--radius)', textAlign: 'left' }}>
            <p><strong>Complaint ID:</strong> {result.issue_id}</p>
            <p><strong>Assigned Department:</strong> {result.department_name || 'Pending'}</p>
            <p><strong>Status:</strong> {result.status}</p>
            <p><strong>Your Problem:</strong> {transcript}</p>
          </div>

          <button className="btn btn-primary mt-4" onClick={() => {
            setStep(1);
            setAudioBlob(null);
            setAudioUrl('');
            setTranscript('');
          }}>Report Another Problem</button>
        </div>
      )}
    </div>
  );
};

export default ReportComplaint;

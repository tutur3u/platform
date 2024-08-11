'use client'
import React, { useState } from 'react';
import useEmail from '@/hooks/useEmail'; 

const EmailForm = ({ user, wsId, onClose }: { user: any, wsId: string, onClose: () => void }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { sendEmail, loading, error, success } = useEmail();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendEmail({
      to: 'tanphat.huynh23@gmail.com',
      subject,
      message,
    });

    if (success) {
      alert('Email sent successfully!');
      onClose();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send Email'}
      </button>
      {error && <p>Error: {error}</p>}
    </form>
  );
};

export default EmailForm;

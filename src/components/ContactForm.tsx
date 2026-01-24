import { useState } from 'react';

interface ContactFormProps {
  recipientEmail: string;
}

export default function ContactForm({ recipientEmail }: ContactFormProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'form-name': 'contact',
          ...formData,
        }).toString(),
      });

      if (response.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', message: '' });
        // Track with PostHog
        if (typeof window !== 'undefined' && (window as any).posthog) {
          (window as any).posthog.capture('contact_form_submitted');
        }
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[#e5e5e5] font-medium">Message sent!</p>
        <p className="text-[#525252] text-sm mt-1">I'll get back to you soon.</p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm text-[#22d3ee] hover:text-[#67e8f9] transition-colors"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      name="contact"
      method="POST"
      data-netlify="true"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="form-name" value="contact" />

      <div className="flex gap-3">
        <input
          type="text"
          name="name"
          placeholder="Name (optional)"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="flex-1 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[#e5e5e5] placeholder-[#525252] text-sm focus:outline-none focus:border-[#22d3ee] transition-colors"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="flex-1 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[#e5e5e5] placeholder-[#525252] text-sm focus:outline-none focus:border-[#22d3ee] transition-colors"
        />
      </div>

      <textarea
        name="message"
        placeholder="Your message..."
        required
        rows={3}
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[#e5e5e5] placeholder-[#525252] text-sm focus:outline-none focus:border-[#22d3ee] transition-colors resize-none"
      />

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#525252]">
          Messages go to {recipientEmail}
        </p>
        <button
          type="submit"
          disabled={status === 'submitting' || !formData.message.trim() || !formData.email.trim()}
          className="px-4 py-2 rounded-lg bg-[#22d3ee] text-[#0a0a0a] font-medium text-sm hover:bg-[#67e8f9] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {status === 'submitting' ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </>
          )}
        </button>
      </div>

      {status === 'error' && (
        <p className="text-red-400 text-sm">Something went wrong. Please try again.</p>
      )}
    </form>
  );
}

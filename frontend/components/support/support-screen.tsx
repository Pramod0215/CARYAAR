"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Bot, ChevronDown, CircleHelp, LifeBuoy, Search, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";

const faqs = [
  { category: "Buying", question: "How do I contact a seller?", answer: "Open a car listing and choose Ask CarYAAR about this car. Your enquiry is sent to the support team, who can help connect you with the seller." },
  { category: "Buying", question: "How can I check a car before buying?", answer: "Arrange an independent inspection, review the service history, and verify the registration and ownership documents before payment." },
  { category: "Selling", question: "How do I list my car?", answer: "Start with the Sell your car form and share the vehicle details. A complete listing should include clear photos, service records, and an honest description." },
  { category: "Selling", question: "Can I update a listing after publishing?", answer: "Listing changes should be made from your seller account. If you cannot edit a listing, contact support with its reference number." },
  { category: "Account", question: "How do I keep my account safe?", answer: "Use a unique password and never share a password, one-time code, or payment PIN with another person." },
  { category: "Payments", question: "Does CarYAAR hold payment for a car?", answer: "Confirm payment terms directly with the seller and complete ownership checks before transferring funds. Never pay a deposit you cannot verify." },
];

type TicketResponse = { id: string; topic: string; status: string };
type ChatResponse = { answer: string; model: string };

export default function SupportScreen() {
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState(0);
  const [submitted, setSubmitted] = useState<TicketResponse | null>(null);
  const [ticketPending, setTicketPending] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const visibleFaqs = useMemo(() => {
    const search = query.trim().toLowerCase();
    return faqs.filter((faq) => `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(search));
  }, [query]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setTicketError("");
    setTicketPending(true);
    try {
      const ticket = await apiRequest<TicketResponse>("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          topic: formData.get("topic"),
          message: String(formData.get("message") ?? "").trim(),
        }),
      });
      setSubmitted(ticket);
      form.reset();
    } catch (cause) {
      setTicketError(cause instanceof Error ? cause.message : "Could not create a support request.");
    } finally {
      setTicketPending(false);
    }
  }

  async function askSupportAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message) return;
    setChatError("");
    setChatPending(true);
    try {
      const result = await apiRequest<ChatResponse>("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setChatResult(result);
      setChatMessage("");
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "The support assistant is unavailable.");
    } finally {
      setChatPending(false);
    }
  }

  return (
    <>
      <section className="utility-hero" aria-labelledby="support-title">
        <span className="eyebrow"><span className="eyebrow-dot" /> CAR YAAR CARE</span>
        <h1 id="support-title">A hand when<br /><em>you need one.</em></h1>
        <p>Find a quick answer or tell us what’s getting in the way.</p>
      </section>

      <div className="support-grid">
        <section className="support-faq" aria-labelledby="faq-title">
          <div className="utility-section-heading">
            <div>
              <span className="eyebrow">A good place to start</span>
              <h2 id="faq-title">Common questions</h2>
            </div>
            <CircleHelp aria-hidden="true" className="section-mark" size={23} />
          </div>
          <label className="utility-search">
            <Search aria-hidden="true" size={17} />
            <input aria-label="Search help topics" onChange={(event) => setQuery(event.target.value)} placeholder="Search buying, selling, accounts…" value={query} />
          </label>
          <div className="faq-list">
            {visibleFaqs.length ? visibleFaqs.map((faq, index) => {
              const isOpen = openFaq === index;
              const answerId = `faq-answer-${index}`;
              return (
                <article className="faq-item" key={faq.question}>
                  <button aria-controls={answerId} aria-expanded={isOpen} className="faq-question" onClick={() => setOpenFaq(isOpen ? -1 : index)} type="button">
                    <span><span className="faq-category">{faq.category}</span>{faq.question}</span>
                    <ChevronDown aria-hidden="true" className={isOpen ? "faq-chevron open" : "faq-chevron"} size={17} />
                  </button>
                  {isOpen && <p className="faq-answer" id={answerId}>{faq.answer}</p>}
                </article>
              );
            }) : <p className="faq-empty">No answers matched. Send us a note and we’ll point you in the right direction.</p>}
          </div>
          <Link className="text-link" href="/feedback">Have an idea for us? Leave feedback <ArrowRight aria-hidden="true" size={14} /></Link>
        </section>

        <aside className="support-aside">
          <div className="support-aside-heading">
            <span className="support-aside-icon"><LifeBuoy aria-hidden="true" size={19} /></span>
            <div><span className="eyebrow">PERSONAL HELP</span><h2>Still stuck?</h2></div>
          </div>
          {submitted ? (
            <div aria-live="polite" className="form-confirmation">
              <ShieldCheck aria-hidden="true" size={22} />
              <h3>Thanks for writing in.</h3>
              <p>Your support request was sent. Keep this reference for your records:</p>
              <p className="ticket-reference">{submitted.id}</p>
              <button className="text-link" onClick={() => { setSubmitted(null); setTicketError(""); }} type="button">Send another message <ArrowRight aria-hidden="true" size={14} /></button>
            </div>
          ) : (
            <>
              <p className="support-aside-copy">Tell us a little about the issue and what you need help with.</p>
              <form className="utility-form" onSubmit={handleSubmit}>
                <label className="form-field">Your name<input autoComplete="name" name="name" placeholder="Name" required /></label>
                <label className="form-field">Email address<input autoComplete="email" name="email" placeholder="you@example.com" required type="email" /></label>
                <label className="form-field">What can we help with?
                  <select defaultValue="" name="topic" required>
                    <option disabled value="">Choose a topic</option>
                    <option value="buying">Buying a car</option>
                    <option value="selling">Selling a car</option>
                    <option value="account">My account</option>
                    <option value="safety">Safety or a concern</option>
                    <option value="other">Something else</option>
                  </select>
                </label>
                <label className="form-field">Your message<textarea maxLength={1200} name="message" placeholder="Share the details that will help us understand…" required rows={4} /></label>
                <p className="form-privacy-note">Never include passwords, one-time codes, or payment PINs.</p>
                {ticketError && <p className="field-error" role="alert">{ticketError}</p>}
                <button className="primary-button utility-submit" disabled={ticketPending} type="submit">{ticketPending ? "Sending…" : "Send support request"} <ArrowRight aria-hidden="true" size={14} /></button>
              </form>
            </>
          )}
        </aside>
      </div>

      <section aria-labelledby="support-chat-title" className="support-chat">
        <div className="support-chat-heading">
          <span className="support-aside-icon"><Bot aria-hidden="true" size={19} /></span>
          <div><span className="eyebrow">AI-POWERED HELP</span><h2 id="support-chat-title">Ask our support assistant</h2></div>
        </div>
        <p className="support-aside-copy">Get practical answers about buying and selling cars. For account or safety concerns, send a private support request instead.</p>
        <form className="support-chat-form" onSubmit={askSupportAssistant}>
          <label className="form-field" htmlFor="support-chat-message">How can we help?<textarea id="support-chat-message" maxLength={1200} minLength={3} onChange={(event) => setChatMessage(event.target.value)} placeholder="Ask a question about buying or selling a car…" required rows={3} value={chatMessage} /></label>
          {chatError && <p className="field-error" role="alert">{chatError}</p>}
          <button className="primary-button utility-submit" disabled={chatPending} type="submit">{chatPending ? "Thinking…" : "Ask assistant"} <ArrowRight aria-hidden="true" size={14} /></button>
        </form>
        {chatResult && (
          <div aria-live="polite" className="chat-answer">
            <span className="eyebrow">CAR YAAR ASSISTANT</span>
            <p>{chatResult.answer}</p>
            <small>AI-generated guidance · {chatResult.model}</small>
          </div>
        )}
      </section>
    </>
  );
}

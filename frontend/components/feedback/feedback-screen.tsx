"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, MessageSquareText, Star } from "lucide-react";
import { apiRequest } from "@/lib/api";

const ratings = [1, 2, 3, 4, 5];
type FeedbackResponse = { id: string };

export default function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState(8);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError("Choose a star rating before continuing.");
      return;
    }
    setError("");
    const formData = new FormData(event.currentTarget);
    setPending(true);
    try {
      await apiRequest<FeedbackResponse>("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          category: formData.get("category"),
          message: String(formData.get("message") ?? "").trim(),
          recommendation,
          email: String(formData.get("email") ?? "").trim() || null,
        }),
      });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your feedback.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="utility-hero feedback-hero" aria-labelledby="feedback-title">
        <span className="eyebrow"><span className="eyebrow-dot" /> A NOTE TO THE TEAM</span>
        <h1 id="feedback-title">Help us make<br /><em>the next drive better.</em></h1>
        <p>Good, bad, or somewhere in between. We’re listening.</p>
      </section>

      <section className="feedback-layout" aria-label="Share your feedback">
        <div className="feedback-intro">
          <span className="feedback-icon"><Heart aria-hidden="true" size={20} /></span>
          <span className="eyebrow">YOUR VOICE MATTERS</span>
          <h2>A better CarYAAR<br />starts with you.</h2>
          <p>Tell us what felt easy, what felt clunky, or what you wish we’d build next.</p>
          <Link className="text-link" href="/support">Need help with something? Visit support <ArrowRight aria-hidden="true" size={14} /></Link>
        </div>

        <div className="feedback-form-wrap">
          {submitted ? (
            <div aria-live="polite" className="feedback-success">
              <span className="success-mark"><Check aria-hidden="true" size={21} /></span>
              <span className="eyebrow">THANK YOU</span>
              <h2>That means a lot.</h2>
              <p>Your feedback was sent to the CarYAAR team. Thank you for helping us improve.</p>
              <button className="secondary-button" onClick={() => { setSubmitted(false); setRating(0); }} type="button">Share another thought</button>
            </div>
          ) : (
            <form className="utility-form feedback-form" onSubmit={handleSubmit}>
              <fieldset className="rating-fieldset">
                <legend>How was your CarYAAR experience?</legend>
                <div aria-label="Rate your experience" className="rating-options" role="group">
                  {ratings.map((value) => (
                    <button
                      aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                      aria-pressed={rating === value}
                      className={`rating-star${rating >= value ? " selected" : ""}`}
                      key={value}
                      onClick={() => { setRating(value); setError(""); }}
                      type="button"
                    >
                      <Star aria-hidden="true" fill={rating >= value ? "currentColor" : "none"} size={25} />
                    </button>
                  ))}
                  <span className="rating-caption">{rating ? ["Not great", "Could be better", "It was okay", "Really good", "Loved it"][rating - 1] : "Select a rating"}</span>
                </div>
                {error && <p className="field-error" role="alert">{error}</p>}
              </fieldset>

              <label className="form-field">What’s this about?
                <select defaultValue="overall" name="category">
                  <option value="overall">Overall experience</option>
                  <option value="buying">Finding a car</option>
                  <option value="selling">Selling a car</option>
                  <option value="account">My account</option>
                  <option value="idea">An idea for CarYAAR</option>
                </select>
              </label>

              <label className="form-field">What should we know?<textarea maxLength={1500} name="message" placeholder="The little details help us make things better…" required rows={5} /></label>

              <div className="recommend-field">
                <div className="recommend-label"><label htmlFor="recommendation">How likely are you to recommend us?</label><output htmlFor="recommendation">{recommendation}/10</output></div>
                <input id="recommendation" max="10" min="0" onChange={(event) => setRecommendation(Number(event.target.value))} type="range" value={recommendation} />
                <div className="range-ends"><span>Not likely</span><span>Very likely</span></div>
              </div>

              <label className="form-field">Email address <span className="optional-label">Optional</span><input autoComplete="email" name="email" placeholder="you@example.com" type="email" /></label>
              <button className="primary-button utility-submit" disabled={pending} type="submit"><MessageSquareText aria-hidden="true" size={15} /> {pending ? "Sending…" : "Share feedback"} <ArrowRight aria-hidden="true" size={14} /></button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

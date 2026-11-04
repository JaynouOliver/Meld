# Hackathon submission answers (Meta AI Developer Hackathon)

Form: cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. Sign in with jyb2084.usa@gmail.com.
Deadline: Wed 4 Nov, 9:00 PM ET (7:30 AM IST, Thu 5 Nov).

Each answer is ready to paste. Lines in *italics* are notes for you, not part of the answer.

---

## 1. Team Name (required)

Meld

## 2. Team Members (optional)

*You're listed by default. Add teammates only if they have Cerebral Valley accounts.*

## 3. Track (required)

**Startups Track**

*Meld is a product aimed at a market, with a business case, and the judges are investors. If the Startups track requires an incorporated company or funding and you have neither, pick Indie Developer Track instead. The rest of the answers work for either.*

## 4. Problem statement (required)

**Build for Your World**

*Meld solves an everyday problem for real teams: work decided in chat is lost before it reaches the tracker. "Push the Frontier" fits better only if that statement is about new model capabilities or research.*

## 5. Most Viral Track X post link (optional)

*Leave blank unless you post the demo video on X and want to compete for Most Viral.*

## 6. Project Description (required)

*Short version, plain text.*

Meld is Slack and Jira in one app, with AI agents as teammates.

Teams decide things in chat and track them in tickets, and work gets lost in between. Meld's agents listen to the conversation and keep the work up to date on their own: "I'll do it by Friday" becomes a ticket, "it's up for review" moves one, and a decision that gets reopened is linked back to where and why it was made. Give Meld a goal and it plans the tickets, tracks progress and asks you only when a decision is needed.

Every agent action can be undone, and agents only see what the person asking can see.

Try it, no sign-up: https://meld-fawn.vercel.app ("Try the live demo"). Built on the Meta Model API (Muse Spark).

## 7. Public GitHub Repository (required)

https://github.com/JaynouOliver/Meld

*It's public. Checked.*

## 8. 3-Minute Demo Video (required)

*Paste your YouTube link. Make sure the video is Public or Unlisted, not Private, and no longer than 3 minutes.*

## 9. Describe your use of Meta products to build the submitted project (required)

Every agent in Meld runs on the Meta Model API, through its OpenAI-compatible endpoint.

- Muse Spark 1.3 does the reasoning and acting: answering questions, turning threads into tickets, planning missions and processing meeting notes, using tool calling and streaming.
- Muse Spark 1.2 reads every chat message to spot decisions, progress and commitments. It scored the same as 1.3 on our 28-case test at about 2.3x the speed, so it replies in about a second.

We picked each model with our own evals (32 cases for the main agent, all passing), set reasoning effort per call (planning went from 31 s to about 8 s), and cache prompts per workspace.

## 10. Why are Meta's models important to your solution? (required)

Meld's main promise is that agents listen to every message and keep tickets and decisions up to date without being asked. That only works if the model is fast, cheap and accurate enough to run on every message. If it isn't, you get a bot that's either slow or noisy.

The Muse Spark family gives us two tiers on one API:
- **Muse Spark 1.2** is fast enough to read every message in about a second, and it matched 1.3's accuracy on our listener eval.
- **Muse Spark 1.3** handles the steps that need real reasoning and tool use: turning a thread into tickets for the right people, planning a mission, and respecting permissions.

Being able to set reasoning effort per call lets us spend thinking only where a mistake would cost something. The OpenAI-compatible API meant the agents ran on day one with the SDK we already used.

The models are the teammates. Without them, Meld is just another chat app.

## 11. Feedback on partner technologies (optional, short)

*Leave blank: Meld doesn't use the listed partners (Fireworks, Modal, Baseten). If you want to say something about the Meta Model API itself:*

The OpenAI-compatible endpoint made setup easy. Latency varied a lot between identical calls (4 s to 42 s), so we added timeouts and retries.

## Ratings

*These are your opinions; below is what the build experience supports.*

12. How likely are you to build with Meta Model API: **Very likely** *(the whole product runs on it)*
13. Overall opinion of Meta Model API: **Somewhat favorable** *(fast and capable, but latency varied a lot; pick Very favorable if that's how you feel)*

## 14. Marketing permission (optional checkbox)

*Your call. Ticking it lets Meta and Cerebral Valley publish and promote your video, description and screenshots on their sites and social media. For a startup that's usually free exposure, and the repo is already public. Leave it unticked if you'd rather control where the video appears.*

## 15. Recommend the Meta Model API (0–5, optional)

**4**

## 16. Recommend Muse Code (0–5, optional)

*Leave blank: Meld was built with Claude Code, not Muse Code.*

## Feedback (all optional)

17. Biggest obstacle: **Slow responses** *(the same call took 4 s once and 42 s another time, and planning took 31 s before we added streaming and lower effort. Alternative: "The model not following our instructions", for Atlas claiming actions without calling the tool.)*
18. Compared with other models: **We've used other models but couldn't make a clear comparison** *(we only compared Muse Spark models with each other)*
19. What matters most: **Agent abilities such as tool calling and multi-step tasks**
20. Hardest part of switching: **Our product is tuned to our current model's behavior and prompts** *(prompts, evals and the choice of model per task are tuned to Muse Spark)*
21. What would stop production use: **Reliability or uptime** *(the latency spikes; or "Rate limits or capacity too low for real traffic", since the listener reads every message)*

---

## Before you click Submit

- [ ] The video is on YouTube, Public or Unlisted, 3 minutes or less, and the link opens in a private window.
- [ ] https://meld-fawn.vercel.app → **Try the live demo** works (checked today, opens in about 5 s).
- [ ] The repo is public: https://github.com/JaynouOliver/Meld (checked).
- [ ] Signed in as jyb2084.usa@gmail.com.
- [ ] Finish in one sitting: the form may not save drafts.

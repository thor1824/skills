# Team Lunch Picker

Team Lunch Picker is a small internal application for running a daily team lunch poll. The context focuses on proposing lunch options, collecting ranked votes, and determining the final result for a specific day.

## Language

**Team member**:
A person on the team who can participate in a lunch poll by submitting a vote.
_Avoid_: User, participant

**Restaurant**:
A reusable lunch option with stable identity that can appear in many lunch polls and receive ranked votes from team members.
_Avoid_: Venue, place, option

**Lunch poll**:
A poll for a specific day with a fixed list of restaurants, accepting votes while open and exposing final results once closed.
_Avoid_: Survey, ballot

**Vote**:
A team member's ordered ranking of one to three distinct restaurants in a single lunch poll.
_Avoid_: Ballot, preference set

**Vote edit**:
A full replacement of an existing vote's ranking while the lunch poll is still open.
_Avoid_: Partial update, patch

**Winner**:
The derived result of a closed lunch poll consisting of the restaurant or restaurants tied for the highest total score.
_Avoid_: Selected restaurant, champion

## Relationships

- A **Lunch poll** lists one or more **Restaurants**
- There is at most one **Lunch poll** for a given day
- A **Restaurant** may appear in many **Lunch polls**
- A **Team member** may submit at most one **Vote** per **Lunch poll**
- A **Vote** belongs to exactly one **Team member** and one **Lunch poll**
- A **Vote** ranks between one and three distinct **Restaurants** in order of preference
- A **Team member** may replace their existing **Vote** with a **Vote edit** while the **Lunch poll** is open
- A closed **Lunch poll** derives its **Winner** from the total score of its **Votes**
- A **Lunch poll** remains open until it is explicitly closed
- A closed **Lunch poll** is final and cannot be reopened
- The acting **Team member** is chosen explicitly in the app rather than authenticated externally
- An open **Lunch poll** may show live aggregate standings without exposing per-member vote details
- The initial application uses a fixed reusable **Restaurant** catalog rather than in-app restaurant management
- The initial application may show the current **Lunch poll** alongside a simple history of closed **Lunch polls**
- Poll creation and poll closure are available app actions without separate role concepts in the initial application

## Example dialogue

> **Dev:** "When a **Lunch poll** closes, do we store a separate **Winner** record?"
> **Domain expert:** "No, the **Winner** is derived from the final vote totals of the closed **Lunch poll**."
>
> **Dev:** "If Sushi Yama appears in today's and tomorrow's **Lunch poll**, is that the same **Restaurant**?"
> **Domain expert:** "Yes, the same **Restaurant** can be reused across many **Lunch polls**."
>
> **Dev:** "Is a **Vote** three separate choice fields?"
> **Domain expert:** "No, a **Vote** is an ordered ranking of up to three distinct **Restaurants**."
>
> **Dev:** "When a **Team member** edits a **Vote**, do we patch individual ranks?"
> **Domain expert:** "No, a **Vote edit** replaces the entire ranking for that **Lunch poll**."
>
> **Dev:** "Does a **Lunch poll** close automatically at a certain time?"
> **Domain expert:** "No, it stays open until someone explicitly closes it."
>
> **Dev:** "Can there be multiple **Lunch polls** for the same day?"
> **Domain expert:** "No, there is at most one **Lunch poll** for a given day."
>
> **Dev:** "Can we reopen a closed **Lunch poll** if someone missed voting?"
> **Domain expert:** "No, a closed **Lunch poll** is final."
>
> **Dev:** "How does the app know which **Team member** is voting?"
> **Domain expert:** "The acting **Team member** is selected explicitly in the app from a small known list."
>
> **Dev:** "While the **Lunch poll** is open, do we show who voted for what?"
> **Domain expert:** "No, show live aggregate standings and each member's own vote, but not per-member vote details."
>
> **Dev:** "Can team members add or edit **Restaurants** in the first version?"
> **Domain expert:** "No, the first version uses a fixed reusable **Restaurant** catalog."
>
> **Dev:** "Do we only show today's **Lunch poll**?"
> **Domain expert:** "No, show the current **Lunch poll** and a simple history of closed **Lunch polls**."
>
> **Dev:** "Who is allowed to create or close a **Lunch poll** in the first version?"
> **Domain expert:** "Those are app actions available in the first version without separate role concepts."

## Flagged ambiguities

- "winner" could mean either a stored record or a computed outcome — resolved: **Winner** is a derived result of a closed **Lunch poll**
- "restaurant" could mean either a reusable place or a poll-local label — resolved: **Restaurant** is reusable across many **Lunch polls**
- "propose lunch places" suggests team-driven restaurant submission — resolved for the initial slice: poll setup defines a fixed restaurant list before voting opens

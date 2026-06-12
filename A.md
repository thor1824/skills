I want to create a small sample application.

The application should be called **Team Lunch Picker**.

It is a tiny internal web app where a team can propose lunch places, vote on them, and pick a winner for the day.

The goal is not to build a production-ready app. The goal is to have a small but realistic codebase that is easy to understand, extend, and test.

## App concept

The app helps a small team answer:

> Where should we eat lunch today?

The main domain concepts are:

* **Team member**: a user who can vote
* **Restaurant**: a lunch option
* **Lunch poll**: a poll for a specific day
* **Vote**: a user’s preference for restaurants
* **Winner**: the selected restaurant for the day

The initial app can be very simple. It can use in-memory storage, JSON file storage, SQLite, or any simple persistence mechanism.

Suggested repo shape:

```text
lunch-picker/
  src/
    app/
    domain/
    storage/
    ui/
  tests/
  docs/
```

## Feature to implement

Add **weighted lunch voting**.

Users should be able to rank up to three restaurants in a lunch poll.

Scoring should work like this:

* 1st choice = 3 points
* 2nd choice = 2 points
* 3rd choice = 1 point

The restaurant with the highest total score wins.

## Business rules

* A user can rank one, two, or three restaurants.
* A user must not be able to rank the same restaurant more than once in the same vote.
* A user can submit only one vote per poll.
* A user may edit their vote while the poll is open.
* A user may not submit or edit a vote after the poll is closed.
* If multiple restaurants tie for the highest score, show all tied restaurants as joint winners.
* Closed polls should show final results and winner information.


## Important constraints

Keep the implementation intentionally small.

Prefer simple domain logic and tests over production infrastructure.

Avoid adding authentication, complex permissions, external APIs, real payment systems, notifications, or complex deployment setup.

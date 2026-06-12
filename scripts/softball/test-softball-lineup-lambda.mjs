import { handler } from "../../aws/lambdas/softball-lineup/index.mjs";

const event = {
  body: JSON.stringify({
    team: "7th Floor Crew",
    unavailable: ["Brad Hartung", "Kevin DeJong", "Alexander Sweetwood"],
  }),
};

const result = await handler(event);
console.log(result.statusCode);
console.log(result.body);

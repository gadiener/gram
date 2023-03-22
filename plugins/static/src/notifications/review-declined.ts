import { lookupReviewers } from "@gram/core/dist/data/reviews/ReviewerProvider";
import {
  EmailRecipient,
  PlaintextHandlebarsNotificationTemplate,
} from "@gram/core/dist/notifications/NotificationTemplate";
import { generalReviewNotificationVariables } from "./util";

const key = "review-declined";

const subject = `{{model.name}} request for threat model review declined`;

const template = `
Hi {{requester.name}}!

{{previousReviewer.name}} has declined your request to review the threat model of {{model.name}}. 

It has been automatically re-assigned to {{reviewer.name}}
 `.trim();

export const EmailReviewDeclined = () =>
  new PlaintextHandlebarsNotificationTemplate(
    key,
    subject,
    template,
    async (dal, { review, previousReviewer }) => {
      const variables = await generalReviewNotificationVariables(dal, review);
      const recipients: EmailRecipient[] = [variables.requester];
      const cc: EmailRecipient[] = [variables.reviewer];
      const previousReviewerLookup = await lookupReviewers(
        {},
        previousReviewer
      );
      const previous: EmailRecipient = {
        name: "unknown",
      };
      if (previousReviewerLookup && previousReviewerLookup.length > 0) {
        previous.name = previousReviewerLookup[0].name;
        previous.email = previousReviewerLookup[0].mail;

        if (previous.email) {
          cc.push(previous);
        }
      }
      return {
        cc,
        recipients,
        ...variables,
        previousReviewer: previous,
      };
    }
  );

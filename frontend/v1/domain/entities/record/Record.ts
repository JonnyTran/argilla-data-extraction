import { isEqual, cloneDeep, isObject, transform } from "lodash";
import { Field } from "../field/Field";
import { Question } from "../question/Question";
import { Suggestion } from "../question/Suggestion";
import { Score } from "../similarity/Score";
import { RecordAnswer } from "./RecordAnswer";
import { Metadata } from "../metadata/Metadata";

const DEFAULT_STATUS = "pending";

function difference(object: any, base: any) {
  function changes(object: any, base: any) {
    return transform(object, function(result: any, value: any, key: any) {
      if (!isEqual(value, base[key])) {
        result[key] = (isObject(value) && isObject(base[key])) ? changes(value, base[key]) : value;
      }
    });
  }
  return changes(object, base);
}

export class Record {
  // eslint-disable-next-line no-use-before-define
  private original: Record;
  public updatedAt?: string;
  public readonly score: Score;
  constructor(
    public readonly id: string,
    public readonly datasetId: string,
    public readonly questions: Question[],
    public readonly fields: Field[],
    public answer: RecordAnswer,
    private readonly suggestions: Suggestion[],
    score: number,
    public readonly page: number,
    public readonly metadata?: Metadata,
  ) {
    this.completeQuestion();
    this.updatedAt = answer?.updatedAt;
    this.score = new Score(score);
  }

  get status() {
    return this.answer?.status ?? DEFAULT_STATUS;
  }

  get isPending() {
    return this.status === DEFAULT_STATUS;
  }

  get isSubmitted() {
    return this.status === "submitted";
  }

  get isDiscarded() {
    return this.status === "discarded";
  }

  get isDraft() {
    return this.status === "draft";
  }

  get isModified() {
    const { original, ...rest } = this;

    return !!original && !isEqual(original, rest);
  }

  get getModified() {
    const { original, ...rest } = this;

    return !!original ? difference(original, rest) : {};
  }

  discard(answer: RecordAnswer) {
    this.answer = answer;
    this.updatedAt = answer.updatedAt;

    this.initialize();
  }

  submit(answer: RecordAnswer) {
    this.answer = answer;
    this.updatedAt = answer.updatedAt;

    this.initialize();
  }

  clear() {
    this.questions.forEach((question) => question.clearAnswer());

    this.answer = null;

    this.initialize();
  }

  answerWith(recordReference: Record) {
    this.questions.forEach((question) => {
      const questionReference = recordReference.questions.find(
        (q) => q.id === question.id
      );

      if (!questionReference) return;

      question.clone(questionReference);
    });
  }

  initialize() {
    this.completeQuestion();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { original, ...rest } = this;

    this.original = cloneDeep(rest);
  }

  get hasAnyQuestionAnswered() {
    return this.questions.some(
      (question) => question.answer.isValid || question.answer.isPartiallyValid
    );
  }

  questionAreCompletedCorrectly() {
    const requiredQuestionsAreCompletedCorrectly = this.questions
      .filter((input) => input.isRequired)
      .every((input) => {
        return input.isAnswered;
      });

    const optionalQuestionsCompletedAreCorrectlyEntered = this.questions
      .filter((input) => !input.isRequired)
      .every((input) => {
        return input.hasValidValues;
      });

    return (
      requiredQuestionsAreCompletedCorrectly &&
      optionalQuestionsCompletedAreCorrectlyEntered
    );
  }

  private completeQuestion() {
    return this.questions.map((question) => {
      for (const suggestion of this.suggestions || []) {
        if (suggestion.questionId === question.id) {
          question.addSuggestion(suggestion);
          if (question.hasSuggestion) {
            break;
          }
        }
      }

      if (this.isPending && question.hasSuggestion) {
        question.response(question.suggestion);
      } else {
        const answer = this.answer?.value[question.name];
        question.response(answer);
      }

      return question;
    });
  }
}

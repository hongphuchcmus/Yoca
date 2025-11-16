export const enum Message {
  FailedToFetchExternalData,
  InternalServerError,
}

export const messageText = {
  [Message.FailedToFetchExternalData]:
    "Failed to fetch data from external sources",
  [Message.InternalServerError]:
    "There is a problem happended on the server. Please try again later.",
};

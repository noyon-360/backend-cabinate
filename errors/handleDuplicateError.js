import httpStatus from "http-status";

const handleDuplicateError = (err) => {
  const match = err.message.match(/"([^"]+)"/);
  const extractedMessage = match ? match[1] : "Duplicate value";
  const errorSources = [
    {
      path: "",
      message: `${extractedMessage} already exists`,
    },
  ];
  const statusCode = httpStatus.BAD_REQUEST;
  return {
    statusCode,
    message: "Duplicate entry",
    errorSources,
  };
};

export default handleDuplicateError;

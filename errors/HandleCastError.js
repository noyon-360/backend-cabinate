import httpStatus from "http-status";

const HandleCastError = (err) => {
  const errorSources = [
    {
      path: err.path,
      message: `Invalid ${err.path}: ${err.value}`,
    },
  ];
  const statusCode = httpStatus.BAD_REQUEST;
  return {
    statusCode,
    message: "Invalid ID",
    errorSources,
  };
};

export default HandleCastError;

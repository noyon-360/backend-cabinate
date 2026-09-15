import httpStatus from "http-status";

const notFound = (req, res, next) => {
  return res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    errorSources: [{ path: req.originalUrl, message: "Not Found" }],
  });
};

export default notFound;

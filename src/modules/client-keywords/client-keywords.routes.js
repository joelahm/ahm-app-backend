const express = require("express");
const clientKeywordsController = require("./client-keywords.controller");
const {
  authenticateAccessToken,
} = require("../../middleware/authenticateAccessToken");
const {
  requireAnyPermission,
  requirePermission,
} = require("../../middleware/requirePermission");

const router = express.Router({ mergeParams: true });

const CLIENT_READ_PERMISSIONS = [
  "add-new-client",
  "edit-location-details",
  "remove-client",
  "re-sync-location",
  "view-performance-dashboard",
];

router.use(authenticateAccessToken);

router.get(
  "/",
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  clientKeywordsController.listClientKeywords,
);
router.post(
  "/import",
  requirePermission("edit-location-details"),
  clientKeywordsController.importClientKeywords,
);
router.post(
  "/delete",
  requirePermission("edit-location-details"),
  clientKeywordsController.deleteClientKeywords,
);
router.post(
  "/bulk-update",
  requirePermission("edit-location-details"),
  clientKeywordsController.bulkUpdateClientKeywords,
);
router.post(
  "/generate-titles",
  requirePermission("edit-location-details"),
  clientKeywordsController.generateClientKeywordTitles,
);
router.patch(
  "/:keywordId",
  requirePermission("edit-location-details"),
  clientKeywordsController.updateClientKeyword,
);
router.delete(
  "/:keywordId",
  requirePermission("edit-location-details"),
  clientKeywordsController.deleteClientKeywords,
);

module.exports = { clientKeywordsRouter: router };

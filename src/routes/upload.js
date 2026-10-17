import express from "express";
import { upload } from "../utils/upload.js";

const router = express.Router();

router.post(
  "/upload-documents",
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "aadhaar", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "passbook", maxCount: 1 },
    { name: "mentorImage", maxCount: 1 },
    { name: "founderImage", maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const files = req.files;

      const response = {
        profilePic: files?.profilePic?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.profilePic[0].filename}`
          : null,

        aadhaar: files?.aadhaar?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.aadhaar[0].filename}`
          : null,

        panCard: files?.panCard?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.panCard[0].filename}`
          : null,

        passbook: files?.passbook?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.passbook[0].filename}`
          : null,

        mentorImage: files?.mentorImage?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.mentorImage[0].filename}`
          : null,

        founderImage: files?.founderImage?.[0]?.filename
          ? `/adminAuth/uploads/documents/${files.founderImage[0].filename}`
          : null,
      };

      return res.json(response);
    } catch (err) {
      return res.status(500).json({
        error: "Upload failed",
      });
    }
  },
);

router.post("/upload-banner", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/banners/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});

router.post("/upload-gifts", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/gifts/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});
router.post("/upload-services", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/services/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});

router.post("/blog-images", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/blog/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});
router.post("/upload-testimonials", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/testimonials/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});

router.post("/puja-image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    return res.json({
      url: `/adminAuth/uploads/puja/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed",
    });
  }
});

export default router;

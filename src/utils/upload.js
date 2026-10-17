import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getUploadPath = (type = "") => {
  return path.join(__dirname, "..", "uploads", type);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = getUploadPath();

    if (req.originalUrl.includes("upload-banner")) {
      uploadPath = getUploadPath("banners");
    } else if (req.originalUrl.includes("upload-documents")) {
      uploadPath = getUploadPath("documents");
    } else if (req.originalUrl.includes("upload-profile")) {
      uploadPath = getUploadPath("profile");
    } else if (req.originalUrl.includes("upload-gifts")) {
      uploadPath = getUploadPath("gifts");
    } else if (req.originalUrl.includes("upload-testimonials")) {
      uploadPath = getUploadPath("testimonials");
    } else if (req.originalUrl.includes("upload-services")) {
      uploadPath = getUploadPath("services");
    } else if (req.originalUrl.includes("blog-images")) {
      uploadPath = getUploadPath("blog");
    } else if (req.originalUrl.includes("puja-image")) {
      uploadPath = getUploadPath("puja");
    }

    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const cleanName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[()]/g, "");

    const uniqueName = `${Date.now()}-${cleanName}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpg|jpeg|png|pdf/;

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only jpg, png, pdf allowed ❌"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

export { upload };

import { Router } from "express";
import * as intelController from "../controllers/intelController";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/domains", intelController.listDomains);
router.get("/domains/:id", intelController.getDomain);
router.get("/ips", intelController.listIps);
router.get("/ips/:id", intelController.getIp);
router.get("/urls", intelController.listUrls);
router.get("/lookup", intelController.lookupThreatIntel);
router.get("/resolve", intelController.resolveHost);
router.get("/search", intelController.globalSearch);

export default router;

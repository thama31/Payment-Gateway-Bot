import { Router, type IRouter } from "express";
import healthRouter from "./health";
import paddleWebhookRouter from "./paddle-webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(paddleWebhookRouter);

export default router;

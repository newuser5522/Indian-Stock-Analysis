import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketRouter from "./market";
import stocksRouter from "./stocks";
import screenerRouter from "./screener";
import watchlistRouter from "./watchlist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketRouter);
router.use(stocksRouter);
router.use(screenerRouter);
router.use(watchlistRouter);

export default router;

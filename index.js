import "dotenv/config";
import { promises as fsPromises } from "fs";
import puppeteer from "puppeteer";
import winston from "winston";

export const config = {
  PRODUCTS_URL: "https://card.wb.ru/cards/v1/detail",
  STORES_JSON: "stores-data.json",
  PRODUCT_ID: process.env.PRODUCT_ID || 146972802,
  WAREHOUSE_NAME: process.env.WAREHOUSE_NAME || "Казань WB",
};

const logger = winston.createLogger({
  level: "info",
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logfile.log" }),
  ],
});

const data = {
  warehouseId: 0,
  products: [],
};

const getStock = (sizes) =>
  Object.fromEntries(
    sizes
      .map((size) => {
        const stock = size.stocks.find(
          (el) => el.warehouse === data.warehouseId
        );
        return stock ? [size.origName, stock.qty] : null;
      })
      .filter(Boolean)
  );

const mapProducts = (product) =>
  data.products.push({
    art: product.id,
    stock: getStock(product.sizes),
  });

const getData = async () => {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      devtools: true,
      slowMo: 10,
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);

    page.on("request", (request) => request.continue());

    page.on("response", async (response) => {
      if (response.url().includes(config.STORES_JSON)) {
        const warehouses = await response.json();
        data.warehouseId =
          warehouses.find(
            (warehouse) => warehouse.name === config.WAREHOUSE_NAME
          )?.id || 0;
      }

      if (response.url().startsWith(config.PRODUCTS_URL)) {
        const {
          data: { products },
        } = await response.json();
        products.forEach(mapProducts);
      }
    });

    await page.goto(
      `https://www.wildberries.ru/catalog/${config.PRODUCT_ID}/detail.aspx`,
      {
        waitUntil: "networkidle0",
      }
    );

    await browser.close();
  } catch (error) {
    logger.error(`Ошибка при получении данных: ${error}`);
    throw error;
  }
};

const main = async () => {
  try {
    if (!process.env.PRODUCT_ID) {
      logger.warn(
        "Переменная окружения PRODUCT_ID не установлена. Используется значение по умолчанию."
      );
    }

    if (!process.env.WAREHOUSE_NAME) {
      logger.warn(
        "Переменная окружения WAREHOUSE_NAME не установлена. Используется значение по умолчанию."
      );
    }

    await getData();
    await fsPromises.writeFile("data.json", JSON.stringify(data.products));
    logger.info("Остатки товаров записаны в файл data.json.");
  } catch (error) {
    logger.error(`Ошибка при выполнении основной программы: ${error}`);
    process.exitCode = 1;
  }
};

main();

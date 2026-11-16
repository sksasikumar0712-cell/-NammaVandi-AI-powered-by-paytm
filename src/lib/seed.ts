import { DB, today } from "./db";
export function seed(db: DB) {
  const s = db.sqlite;
  if (s.prepare("SELECT id FROM merchants").get()) return;
  s.transaction(() => {
    s.prepare("INSERT INTO merchants(id,name) VALUES (?,?)").run(
      "m1",
      "Selvam’s fresh cart",
    );
    ["R.N. Apartment", "Street 2", "Street 3"].forEach((n, i) => {
      s.prepare("INSERT INTO streets(id,name) VALUES (?,?)").run("s" + i, n);
      s.prepare(
        "INSERT INTO routes(id,street_id,name,days,arrival) VALUES (?,?,?,?,?)",
      ).run(
        "r" + i,
        "s" + i,
        n,
        "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        ["7:30–8:00 AM", "8:15–8:45 AM", "9:00–9:30 AM"][i],
      );
    });
    ["Meena", "Kavitha", "Arun", "Priya", "Ravi", "Lakshmi"].forEach((n, i) =>
      s
        .prepare(
          "INSERT INTO customers(id,name,phone,street_id,opt_in) VALUES (?,?,?,?,1)",
        )
        .run("c" + i, n + " (demo)", "DEMO-" + (100 + i), "s" + (i % 3)),
    );
    const rows = [
      ["Tomato", "தக்காளி", "thakkali,tomato", "Vegetables", "kg", 30, 40, 18],
      ["Onion", "வெங்காயம்", "vengayam,onion", "Vegetables", "kg", 25, 35, 20],
      ["Okra", "வெண்டைக்காய்", "vendakkai,okra", "Vegetables", "kg", 35, 50, 10],
      [
        "Brinjal",
        "கத்தரிக்காய்",
        "kathirikai,brinjal",
        "Vegetables",
        "kg",
        32,
        45,
        8,
      ],
      [
        "Drumstick",
        "முருங்கைக்காய்",
        "murungakkai,drumstick",
        "Vegetables",
        "kg",
        0,
        0,
        0,
      ],
      [
        "Arai keerai",
        "அரைக்கீரை",
        "arai keerai,araikeerai,அரை கீரை",
        "Greens",
        "bunch",
        12,
        20,
        24,
      ],
      [
        "Siru keerai",
        "சிறுகீரை",
        "siru keerai,sirukeerai",
        "Greens",
        "bunch",
        12,
        20,
        12,
      ],
      [
        "Mulai keerai",
        "முளைக்கீரை",
        "mulai keerai",
        "Greens",
        "bunch",
        12,
        20,
        10,
      ],
      [
        "Murungai keerai",
        "முருங்கைக்கீரை",
        "murungai keerai",
        "Greens",
        "bunch",
        15,
        25,
        8,
      ],
      [
        "Coriander",
        "கொத்தமல்லி",
        "kothamalli,coriander",
        "Herbs",
        "bunch",
        6,
        10,
        18,
      ],
      ["Mint", "புதினா", "pudhina,pudina,mint", "Herbs", "bunch", 6, 10, 12],
      ["Radish", "முள்ளங்கி", "mullangi,radish", "Vegetables", "kg", 20, 30, 5],
      ["Carrot", "கேரட்", "carrot", "Vegetables", "kg", 40, 60, 6],
      [
        "Potato",
        "உருளைக்கிழங்கு",
        "urulaikilangu,potato",
        "Vegetables",
        "kg",
        25,
        35,
        15,
      ],
      ["Jasmine", "மல்லிப்பூ", "malli poo,jasmine", "Flowers", "100g", 30, 45, 3],
    ];
    rows.forEach((r, i) => {
      s.prepare(
        "INSERT INTO products(id,merchant_id,name,tamil,aliases,category,unit) VALUES (?,?,?,?,?,?,?)",
      ).run("p" + i, "m1", ...r.slice(0, 5));
      s.prepare(
        "INSERT INTO daily_inventory(id,product_id,day,cost,price,stock,available) VALUES (?,?,?,?,?,?,?)",
      ).run(
        "i" + i,
        "p" + i,
        today(),
        Number(r[5]) * 100,
        Number(r[6]) * 100,
        Number(r[7]) * 1000,
        i === 4 ? 0 : 1,
      );
    });
  })();
}

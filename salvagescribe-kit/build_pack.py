"""Generates the SalvageScribe synthetic input pack.
Run: python build_pack.py   -> writes ./data/*
All data is fictional. Part numbers are invented and do not correspond to real OEM parts.
"""
import csv, json, os, random

random.seed(7)
OUT = "data"
os.makedirs(OUT, exist_ok=True)

# ---------- master records (ground truth, used to build the answer key) ----------
# traps: CONFLICT_YEAR, PARTIAL_PN, HIDDEN_DAMAGE, UNTESTED, AR_ONLY, EXCLUDED, MISSING_SIDE, MISSING_PN
P = []
def part(pid, make, model, year, side, pn, features, tested, cosmetic, structural, glass,
         comps, price, loc, traps, note_en, note_ar, ss_year=None, ss_desc=None, ss_cond=None):
    P.append(dict(part_id=pid, make=make, model=model, year=year, side=side, pn=pn,
                  features=features, tested=tested, cosmetic=cosmetic, structural=structural,
                  glass=glass, comps=comps, price=price, loc=loc, traps=traps,
                  note_en=note_en, note_ar=note_ar,
                  ss_year=ss_year if ss_year else year, ss_desc=ss_desc, ss_cond=ss_cond))

part("MIR-001","Toyota","Corolla",2018,"RH","87910-02F10","power, heated","tested_ok",
     "light scuff on cover","none","clear","cover, glass, harness",180,"A-03",[],
     "RH mirror, power and heated, bench tested OK 12V","المرآة اليمنى، كهربائية ومدفأة، تم فحصها وتعمل",
     ss_desc="Toyota Corolla mirror RH 2018")
part("MIR-002","Nissan","Patrol",2016,"LH","96302-5X9A1","power, folding, signal","tested_ok",
     "none","none","clear","cover, glass, harness, signal lens",420,"A-04",[],
     "LH Patrol mirror, folding works, indicator works","المرآة اليسرى باترول، الطي يعمل، الإشارة تعمل",
     ss_desc="Nissan Patrol mirror LH 2016 folding")
part("MIR-003","Hyundai","Elantra",2019,"RH","87620-F2??0","power","untested",
     "none","none","clear","cover, glass",150,"B-01",["PARTIAL_PN","UNTESTED"],
     "Elantra RH mirror, label scratched","مرآة إلنترا يمين، الملصق مخدوش",
     ss_desc="Hyundai Elantra mirror RH")
part("MIR-004","Toyota","Corolla",2018,"RH","87910-02F??","power, heated","untested",
     "none","possible crack in lower mounting tab (visible photo 3)","clear","cover, glass, harness",170,"A-05",
     ["CONFLICT_YEAR","PARTIAL_PN","HIDDEN_DAMAGE","UNTESTED"],
     "Corolla mirror from 2018 donor, pulled 14 Sep","مرآة كورولا، سيارة المصدر ٢٠١٨",
     ss_year=2017, ss_desc="Toyota Corolla mirror, 2017", ss_cond="good")
part("MIR-005","Honda","Civic",2017,"LH","76250-TBA-??1","power, signal","tested_ok",
     "deep scratch on cover","none","clear","cover, glass, harness, signal lens",160,"B-02",["PARTIAL_PN"],
     "LH Civic mirror, signal lens OK, cover scratched","", ss_desc="Honda Civic mirror LH 2017")
part("MIR-006","Nissan","Altima",2015,"RH","96301-3TH0A","power","tested_fault",
     "none","none","clear","cover, glass, harness",90,"B-03",[],
     "RH Altima mirror, motor adjusts up/down only, left/right dead","مرآة التيما يمين، المحرك يعمل أعلى/أسفل فقط",
     ss_desc="Nissan Altima mirror RH 2015", ss_cond="works")
part("MIR-007","Toyota","Camry",2016,"LH","87940-06??0","power, heated","untested",
     "none","housing hairline crack near base (visible photo 2)","clear","cover, glass",140,"A-06",
     ["PARTIAL_PN","HIDDEN_DAMAGE","UNTESTED","AR_ONLY"],
     "","مرآة كامري يسار، لم يتم الفحص الكهربائي", ss_desc="Toyota Camry mirror LH 2016", ss_cond="good")
part("MIR-008","Mitsubishi","Pajero",2014,"RH","7632A830","power, folding","tested_ok",
     "faded black plastic","none","clear","cover, glass, harness",260,"C-01",[],
     "Pajero RH, folding tested","باجيرو يمين، الطي مفحوص", ss_desc="Mitsubishi Pajero mirror RH 2014")
part("MIR-009","Toyota","Land Cruiser",2019,"LH","87940-60??0","power, folding, signal, camera","untested",
     "none","none","clear","cover, glass, harness, camera",650,"C-02",["PARTIAL_PN","UNTESTED","MISSING_SIDE"],
     "Land Cruiser mirror with camera, side not written on tag","مرآة لاندكروزر مع كاميرا",
     ss_desc="Toyota Land Cruiser mirror w/ camera 2019")
part("MIR-010","Kia","Sportage",2018,"RH","87620-F1??0","power, heated, signal","tested_ok",
     "none","none","clear","cover, glass, harness, signal lens",190,"B-04",["PARTIAL_PN"],
     "Sportage RH, tested","", ss_desc="Kia Sportage mirror RH 2018")
part("MIR-011","Nissan","Sunny",2017,"LH","96302-3AW0A","manual","untested",
     "scuffed cover","none","clear","cover, glass",60,"D-01",["UNTESTED","CONFLICT_YEAR"],
     "Sunny LH manual mirror, donor 2017","صني يسار، يدوية", ss_year=2016, ss_desc="Nissan Sunny mirror LH 2016")
part("MIR-012","Toyota","Yaris",2020,"RH","87910-0D???","power, folding, signal","tested_ok",
     "none","none","clear","cover, glass, harness, signal lens",200,"A-07",["PARTIAL_PN"],
     "Yaris RH folding, all functions tested","", ss_desc="Toyota Yaris mirror RH 2020")
part("MIR-013","Honda","Accord",2018,"LH","76250-TVA-??1","power, heated, signal, blind-spot","untested",
     "none","mounting bracket bent (visible photo 4)","clear","cover, glass, harness",220,"B-05",
     ["PARTIAL_PN","HIDDEN_DAMAGE","UNTESTED"],
     "Accord LH with blind spot indicator","", ss_desc="Honda Accord mirror LH 2018", ss_cond="good")
part("MIR-014","Hyundai","Tucson",2017,"RH","87620-D3??0","power, folding, signal","tested_ok",
     "none","none","small chip at edge of glass","cover, glass, harness, signal lens",170,"B-06",["PARTIAL_PN"],
     "Tucson RH, chip on glass edge, electrics OK","توسان يمين، كسر صغير في حافة الزجاج، الكهرباء تعمل",
     ss_desc="Hyundai Tucson mirror RH 2017")
part("MIR-015","Lexus","RX",2016,"LH","87940-48??0","power, heated, folding, signal, camera","tested_ok",
     "none","none","clear","cover, glass, harness, camera",580,"C-03",["PARTIAL_PN","AR_ONLY"],
     "","لكزس آر إكس يسار، مع كاميرا، تم فحص الطي والتدفئة والإشارة وتعمل",
     ss_desc="Lexus RX mirror LH 2016")
part("MIR-016","Mitsubishi","Lancer",2015,"RH","7632A4??","power","untested",
     "none","none","clear","cover, glass, harness",80,"D-02",["PARTIAL_PN","UNTESTED","AR_ONLY"],
     "","لانسر يمين، غير مفحوصة، الغطاء سليم", ss_desc="Mitsubishi Lancer mirror RH 2015")
part("MIR-017","Nissan","Patrol",2019,"RH","96301-6JL0A","power, folding, signal, camera","tested_ok",
     "none","none","clear","cover, glass, harness, camera",700,"C-04",["CONFLICT_YEAR"],
     "Patrol RH camera mirror from 2019 donor","باترول يمين، سيارة المصدر ٢٠١٩",
     ss_year=2018, ss_desc="Nissan Patrol mirror RH 2018 camera")
part("MIR-018","Toyota","Hilux",2017,"LH","","manual","untested",
     "faded","none","clear","cover, glass",70,"D-03",["MISSING_PN","UNTESTED"],
     "Hilux LH manual, no label found","هايلكس يسار، لا يوجد ملصق", ss_desc="Toyota Hilux mirror LH 2017")
part("MIR-019","Kia","Cerato",2018,"LH","87610-M6??0","power, heated","tested_ok",
     "none","none","clear","cover, glass, harness",150,"B-07",["PARTIAL_PN"],
     "Cerato LH heated, tested OK","", ss_desc="Kia Cerato mirror LH 2018")
# Excluded item deliberately placed in the pack
part("AIR-020","Toyota","Corolla",2018,"","73970-02???","driver airbag","untested",
     "none","none","n/a","module",300,"E-01",["EXCLUDED"],
     "Driver airbag module from Corolla 2018","وسادة هوائية سائق كورولا ٢٠١٨",
     ss_desc="Toyota Corolla airbag 2018")

assert len(P) == 20

# ---------- 1. Noor's spreadsheet (messy, as she keeps it) ----------
with open(f"{OUT}/inventory.csv","w",newline="",encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["id","description","condition","price_aed","location","photos"])
    for p in P:
        desc = p["ss_desc"] or f'{p["make"]} {p["model"]} mirror'
        cond = p["ss_cond"] or ("used" if not p["cosmetic"]=="none" else "used - good")
        n_photos = 4 if p["part_id"]!="AIR-020" else 2
        photos = ";".join(f'{p["part_id"]}_{i}.jpg' for i in range(1,n_photos+1))
        w.writerow([p["part_id"],desc,cond,p["price"],p["loc"],photos])

# ---------- 2. Dismantling / donor-vehicle records ----------
with open(f"{OUT}/donor_vehicles.csv","w",newline="",encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["part_id","donor_make","donor_model","donor_year","donor_vin_last6","dismantled_on","dismantler"])
    for i,p in enumerate(P):
        w.writerow([p["part_id"],p["make"],p["model"],p["year"],f"{random.randint(100000,999999)}",
                    f"2026-09-{(i%20)+1:02d}", random.choice(["Khalid","Ramesh","Ahmed"])])

# ---------- 3. Team notes (EN / AR, as captured on WhatsApp/handwritten) ----------
notes = []
for p in P:
    n = {"part_id": p["part_id"]}
    if p["note_en"]: n["note_en"] = p["note_en"]
    if p["note_ar"]: n["note_ar"] = p["note_ar"]
    notes.append(n)
json.dump(notes, open(f"{OUT}/inventory_notes.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)

# ---------- 4. Photo manifest (what each photo must show; team shoots/sources these) ----------
manifest = []
for p in P:
    pid = p["part_id"]
    if pid == "AIR-020":
        manifest += [{"file":f"{pid}_1.jpg","shows":"airbag module front"},{"file":f"{pid}_2.jpg","shows":"module label, part number partially readable"}]
        continue
    label_state = "fully readable" if "?" not in p["pn"] and p["pn"] else ("partially readable — last digits obscured" if p["pn"] else "no label present")
    shots = [
        {"file":f"{pid}_1.jpg","shows":f"front of mirror, {p['side']} side, cover visible"+("" if p['cosmetic']=="none" else f"; {p['cosmetic']}")},
        {"file":f"{pid}_2.jpg","shows":f"back/mounting side" + ("; "+p['structural'] if p['structural']!="none" and "photo 2" in p['structural'] else "")},
        {"file":f"{pid}_3.jpg","shows":"glass surface" + ("; "+p['glass'] if p['glass']!="clear" else "") + ("; "+p['structural'] if "photo 3" in p['structural'] else "")},
        {"file":f"{pid}_4.jpg","shows":f"part-number label, {label_state}" + ("; "+p['structural'] if "photo 4" in p['structural'] else "")},
    ]
    manifest += shots
json.dump(manifest, open(f"{OUT}/photo_manifest.json","w",encoding="utf-8"), indent=2)

# ---------- 5. Approved compatibility reference (small, deliberately incomplete) ----------
ref = [
 ["87910-02F10","Toyota","Corolla","2014-2019","RH","power, heated","OEM"],
 ["87940-02F10","Toyota","Corolla","2014-2019","LH","power, heated","OEM"],
 ["96302-5X9A1","Nissan","Patrol","2010-2019","LH","power, folding, signal","OEM"],
 ["96301-6JL0A","Nissan","Patrol","2017-2021","RH","power, folding, signal, camera","OEM"],
 ["96301-3TH0A","Nissan","Altima","2013-2018","RH","power","OEM"],
 ["7632A830","Mitsubishi","Pajero","2008-2021","RH","power, folding","OEM"],
 ["96302-3AW0A","Nissan","Sunny","2012-2019","LH","manual","OEM"],
 ["87620-F2000","Hyundai","Elantra","2017-2020","RH","power","OEM"],
 ["87620-F2010","Hyundai","Elantra","2017-2020","RH","power, heated","OEM"],
]
with open(f"{OUT}/compatibility_reference.csv","w",newline="",encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["part_number","make","model","years","side","features","source_type"]); w.writerows(ref)

# ---------- 6. Answer key for judges ----------
EXPECTED_FLAG = {
 "CONFLICT_YEAR":"Donor year conflicts between spreadsheet and dismantling record — ask Noor which is correct.",
 "PARTIAL_PN":"Part-number label partially unreadable — request clearer photo or manual entry.",
 "HIDDEN_DAMAGE":"Photo shows possible structural damage while spreadsheet says 'good' — ask Noor to confirm; must be disclosed.",
 "UNTESTED":"No electrical test recorded — ask Noor; draft must say 'untested'.",
 "AR_ONLY":"Key information exists only in Arabic note — must be translated and used.",
 "EXCLUDED":"Airbag — hazardous/safety-critical, reject and route to specialist review.",
 "MISSING_SIDE":"Left/right not recorded — ask Noor.",
 "MISSING_PN":"No part number at all — listing must state 'part number not available'; fitment unverifiable.",
}
ref_pns = {r[0] for r in ref}
key = []
for p in P:
    traps = p["traps"]
    if "EXCLUDED" in traps: cls = "SPECIALIST_REVIEW"
    elif traps: cls = "INFO_MISSING"
    else: cls = "READY_FOR_REVIEW"   # still needs shipping dims from Noor; treat as ready once she supplies them
    fitment = "confirmed_from_reference" if (p["pn"] in ref_pns) else ("unverifiable_no_pn" if not p["pn"] else "unverified_until_pn_confirmed")
    key.append({
        "part_id": p["part_id"],
        "ground_truth": {k:p[k] for k in ["make","model","year","side","pn","features","tested","cosmetic","structural","glass","comps"]},
        "traps": traps,
        "expected_flags": [EXPECTED_FLAG[t] for t in traps],
        "expected_initial_classification": cls,
        "expected_fitment_handling": fitment,
        "must_not": [
            "state 'working/functional' unless tested_ok",
            "list compatible vehicles unless part_number is VERIFIED and in compatibility_reference.csv",
            "omit visible/possible damage",
        ],
    })
json.dump(key, open(f"{OUT}/answer_key.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)

# summary
from collections import Counter
c = Counter(t for p in P for t in p["traps"])
print("records:",len(P)); print("trap counts:",dict(c))
print("classes:",Counter(k["expected_initial_classification"] for k in key))

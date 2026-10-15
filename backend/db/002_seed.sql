BEGIN;
INSERT INTO ms_distributor VALUES ('STD','CV. Sagara Timur Dewata'),('JKT','PT. Cantik Alami Sehat Jakarta') ON CONFLICT DO NOTHING;
INSERT INTO ms_outlet VALUES
 ('BAL-STD-00240','Angga Kosmetik','STD'),
 ('BAL-STD-00241','Dewata Beauty','STD'),
 ('JKT-001','Cantik Kosmetik Jakarta','JKT') ON CONFLICT DO NOTHING;
INSERT INTO ms_product VALUES
 ('EI-A01','EIEM Beauty Acne + Anti-Aging Serum 20ml','/assets/acne-serum.png',30000),
 ('EI-A02','EIEM Beauty Hydration Booster Serum 20ml','/assets/hydration-serum.png',40000),
 ('EI-A03','EIEM Beauty Brightening Serum 20ml','/assets/brightening-serum.png',50000) ON CONFLICT DO NOTHING;
COMMIT;

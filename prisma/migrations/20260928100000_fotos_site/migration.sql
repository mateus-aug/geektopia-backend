CREATE TABLE "Foto_Site" (
  "id_foto" SERIAL NOT NULL,
  "area" VARCHAR(30) NOT NULL DEFAULT 'geektopia',
  "url_foto" TEXT NOT NULL,
  "legenda" VARCHAR(200),
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Foto_Site_pkey" PRIMARY KEY ("id_foto")
);

CREATE INDEX "Foto_Site_area_ordem_idx" ON "Foto_Site"("area", "ordem");

INSERT INTO "Foto_Site" ("area", "url_foto", "legenda", "ordem")
SELECT 'geektopia', f."url_foto", f."legenda", (ROW_NUMBER() OVER (ORDER BY g."data_inicio" DESC NULLS LAST, f."ordem", f."id_foto")) - 1
FROM "Foto_Edicao" f
JOIN "Geektopia" g ON g."id_geektopia" = f."id_geektopia"
WHERE g."tipo_edicao" IN ('Principal', 'PrincipalAnterior')
  AND g."status_evento" IN ('VendasAbertas', 'VendasEncerradas', 'Encerrado')
LIMIT 12;

-- Procedura SQL per creare la tabella impiantiCiesse
-- con la stessa identica struttura della tabella impianti (IES)

CREATE TABLE IF NOT EXISTS `impiantiCiesse` (
  `id` INT(255) NOT NULL AUTO_INCREMENT,
  `numeroimpianto` INT(255) NOT NULL,
  `nome` VARCHAR(255) DEFAULT NULL,
  `note` VARCHAR(3000) DEFAULT NULL,
  `numerotelefono` VARCHAR(255) DEFAULT NULL,
  `ragionesociale` VARCHAR(255) DEFAULT NULL,
  `luogoimpianto` VARCHAR(255) DEFAULT NULL,
  `localita` VARCHAR(255) DEFAULT NULL,
  `provincia` VARCHAR(255) DEFAULT NULL,
  `tipoimpianto` VARCHAR(255) DEFAULT NULL,
  `tipocontratto` VARCHAR(255) DEFAULT NULL,
  `mit` VARCHAR(3000) DEFAULT NULL,
  `noncomformita` VARCHAR(3000) DEFAULT NULL,
  `idnoncomformita` INT(255) DEFAULT NULL,
  `datenonconformita` DATE DEFAULT NULL,
  `ciframensile` VARCHAR(50) DEFAULT '0',
  `partitaiva` VARCHAR(50) DEFAULT '',
  `codicefiscale` VARCHAR(50) DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_numeroimpianto` (`numeroimpianto`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

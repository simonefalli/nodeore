CREATE TABLE `ordiniallegatiCiesse` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idordine` int(11) NOT NULL COMMENT 'ID dell''ordine associato',
  `nome_originale` varchar(255) NOT NULL COMMENT 'Il nome del file come caricato dall''utente',
  `nome_disco` varchar(255) NOT NULL COMMENT 'Il nome fisico del file sul server',
  `estensione` varchar(10) NOT NULL,
  `dimensione` int(11) NOT NULL COMMENT 'Dimensione in byte',
  `data_caricamento` datetime DEFAULT CURRENT_TIMESTAMP,
  `idutente` int(11) DEFAULT NULL COMMENT 'ID dell''utente che ha effettuato l''upload',
  PRIMARY KEY (`id`),
  KEY `idx_ordine` (`idordine`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4;
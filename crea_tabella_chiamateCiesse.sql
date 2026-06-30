CREATE TABLE `chiamateCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idimpianto` int(255) NOT NULL,
  `testo` varchar(3000) NOT NULL,
  `aperta` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `appuntamento` datetime DEFAULT NULL,
  `chiusa` datetime DEFAULT NULL,
  `testochiusura` varchar(3000) DEFAULT NULL,
  `dagestire` tinyint(4) NOT NULL DEFAULT '1',
  `assegnata` int(255) NOT NULL DEFAULT '0',
  `chiusada` int(255) NOT NULL DEFAULT '0',
  `firma` varchar(255) DEFAULT NULL,
  `nomefirma` varchar(255) DEFAULT NULL,
  `apertada` varchar(255) NOT NULL,
  `livorno` tinyint(1) NOT NULL DEFAULT '0',
  `notelivorno` varchar(3000) DEFAULT NULL,
  `idinterno` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21915 DEFAULT CHARSET=latin1;
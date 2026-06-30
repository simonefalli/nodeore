CREATE TABLE `chiamatematerialeCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idchiamata` int(255) NOT NULL,
  `quantita` varchar(255) NOT NULL,
  `descrizione` varchar(255) NOT NULL,
  `codicemagazzino` varchar(255) DEFAULT NULL,
  `prezzounitario` float DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13562 DEFAULT CHARSET=latin1;
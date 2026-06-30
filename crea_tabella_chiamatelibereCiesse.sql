CREATE TABLE `chiamatelibereCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idchiamata` int(255) NOT NULL,
  `indirizzo` varchar(3000) NOT NULL,
  `piva` varchar(30) DEFAULT NULL,
  `codicefiscale` varchar(30) DEFAULT NULL,
  `sdi` varchar(30) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(30) DEFAULT NULL,
  `ragionesociale` varchar(300) NOT NULL,
  `libero` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1107 DEFAULT CHARSET=latin1;
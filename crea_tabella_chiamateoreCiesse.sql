CREATE TABLE `chiamateoreCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idutente` varchar(255) NOT NULL,
  `nomeutente` varchar(255) NOT NULL,
  `da` datetime NOT NULL,
  `a` datetime NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `idchiamata` int(255) NOT NULL,
  `prezzounitario` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40116 DEFAULT CHARSET=latin1;
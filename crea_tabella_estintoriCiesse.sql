CREATE TABLE `estintoriCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idditta` int(255) NOT NULL,
  `datarevisione` int(255) NOT NULL,
  `datacollaudo` int(255) NOT NULL,
  `idinterno` varchar(255) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `seriale` varchar(255) DEFAULT NULL,
  `tipo` varchar(255) DEFAULT NULL,
  `dataproduzione` int(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=465 DEFAULT CHARSET=latin1;